from flask import Flask, render_template, url_for ,request, jsonify, redirect
from flask_socketio import SocketIO, emit, join_room
from dotenv import load_dotenv
import json
import os
import shutil
import subprocess
import urllib.error
import urllib.request
import uuid

load_dotenv()

app = Flask(__name__)
app.config['SECRET_KEY'] = 'secret!'
socketio = SocketIO(app, cors_allowed_origins="*")
FS_ROOT = os.path.abspath(os.getcwd())

def resolve_fs_path(relative_path=''):
	relative = (relative_path or '').replace('\\', '/').strip().lstrip('/')
	normalized = os.path.normpath(relative)
	if normalized in ('', '.'):
		return FS_ROOT
	target = os.path.abspath(os.path.join(FS_ROOT, normalized))
	if target != FS_ROOT and not target.startswith(FS_ROOT + os.sep):
		raise ValueError("Invalid path")
	return target

def clean_gemini_code_output(text):
	cleaned = (text or '').strip()
	if cleaned.startswith("```"):
		lines = cleaned.splitlines()
		if lines and lines[0].strip().startswith("```"):
			lines = lines[1:]
		if lines and lines[-1].strip().startswith("```"):
			lines = lines[:-1]
		cleaned = "\n".join(lines).strip()
	return cleaned

def build_model_candidates(requested_model=''):
	model_candidates = []
	if requested_model:
		model_candidates.append(requested_model)
	model_candidates.extend([
		'gemini-1.5-flash',
		'gemini-2.0-flash',
		'gemini-2.0-flash-lite',
		'gemini-flash-latest',
		'gemini-flash-lite-latest',
	])
	seen = set()
	return [m for m in model_candidates if not (m in seen or seen.add(m))]

def call_gemini_with_fallback(payload, requested_model=''):
	api_key = os.getenv('GEMINI_API_KEY', '').strip()
	if not api_key:
		return None, None, {
			'error': 'GEMINI_API_KEY is not configured on server',
			'statusCode': 500,
		}

	result = None
	used_model = None
	last_error_details = ''
	model_candidates = build_model_candidates(requested_model)

	for model_name in model_candidates:
		url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key}"
		try:
			req = urllib.request.Request(
				url,
				data=json.dumps(payload).encode('utf-8'),
				headers={'Content-Type': 'application/json'},
				method='POST'
			)
			with urllib.request.urlopen(req, timeout=45) as response:
				result = json.loads(response.read().decode('utf-8'))
				used_model = model_name
				break
		except urllib.error.HTTPError as http_error:
			error_body = http_error.read().decode('utf-8', errors='ignore')
			last_error_details = error_body
			if http_error.code in (404, 429):
				continue
			return None, None, {
				'error': 'Gemini API request failed',
				'details': error_body,
				'modelTried': model_name,
				'statusCode': 502,
			}
		except Exception as error:
			last_error_details = str(error)
			continue

	if result is None:
		return None, None, {
			'error': 'Gemini API request failed',
			'details': last_error_details or 'No supported Gemini model was reachable',
			'modelTried': ', '.join(model_candidates),
			'statusCode': 502,
		}

	return result, used_model, None

def extract_gemini_text(result):
	candidates = result.get('candidates') or []
	parts = []
	if candidates:
		parts = candidates[0].get('content', {}).get('parts') or []
	return parts[0].get('text', '') if parts else ''

@app.route('/')
def index():
	room_id = request.args.get('room_id', '')
	# If someone passed a full URL as room_id (e.g. copied link), extract just the UUID
	if room_id.startswith('http://') or room_id.startswith('https://'):
		segments = [s for s in room_id.split('/') if s]
		room_id = segments[-1] if segments else ''
	return render_template('home.html', room_id=room_id)

@app.route('/compile',methods=['POST','GET'])
def compile():
	if request.method  == 'POST':
		
		code = request.get_json().get('codeVal')
		inputVal = request.get_json().get('inputVal')
		langType = request.get_json().get('langType')

		output = code_exe(langType,code,inputVal)
		data = {'result':output}
		return jsonify(data)
	else:
		return jsonify({'error':'invalid access'}) 

@app.route('/api/generate-code', methods=['POST'])
def generate_code():
	data = request.get_json(silent=True) or {}
	prompt = (data.get('prompt') or '').strip()
	context = (data.get('context') or '').strip()
	language = (data.get('language') or 'plain').strip()
	requested_model = (data.get('model') or os.getenv('GEMINI_MODEL') or '').strip()

	if not prompt and not context:
		return jsonify({'error': 'prompt or context is required'}), 400

	system_instruction = (
		"You are a code generation engine. Return only raw code snippet text. "
		"Do not include markdown code fences, backticks, explanations, headings, or commentary."
	)

	request_text = (
		f"Language: {language}\n"
		f"Current editor context:\n{context}\n\n"
		f"User prompt/current line/comment:\n{prompt}\n\n"
		"Generate only the code to insert at cursor position."
	)

	payload = {
		"system_instruction": {
			"parts": [{"text": system_instruction}]
		},
		"contents": [
			{
				"role": "user",
				"parts": [{"text": request_text}]
			}
		],
		"generationConfig": {
			"temperature": 0.3,
			"topP": 0.9,
			"maxOutputTokens": 2048
		}
	}

	result, used_model, error_data = call_gemini_with_fallback(payload, requested_model)
	if error_data:
		status_code = error_data.pop('statusCode', 502)
		return jsonify(error_data), status_code

	generated_text = extract_gemini_text(result)
	cleaned_code = clean_gemini_code_output(generated_text)

	if not cleaned_code:
		return jsonify({'error': 'Gemini returned empty output'}), 502

	return jsonify({'code': cleaned_code, 'model': used_model})

@app.route('/api/fix-code', methods=['POST'])
def fix_code():
	data = request.get_json(silent=True) or {}
	original_code = (data.get('code') or '').rstrip('\n')
	language = (data.get('language') or 'plain').strip()
	requested_model = (data.get('model') or os.getenv('GEMINI_MODEL') or '').strip()

	if not original_code.strip():
		return jsonify({'error': 'code is required'}), 400

	system_instruction = (
		"You are a code fixer. Return ONLY a valid JSON object with exactly two keys: "
		"originalCode and correctedCode. Do not return markdown fences, prose, or explanations."
	)

	request_text = (
		f"Language: {language}\n"
		"Fix bugs and obvious issues while preserving intent. Keep corrected code complete and runnable when possible.\n"
		"Return strict JSON only in this shape:\n"
		"{\"originalCode\":\"...\",\"correctedCode\":\"...\"}\n\n"
		f"Original code:\n{original_code}"
	)

	payload = {
		"system_instruction": {
			"parts": [{"text": system_instruction}]
		},
		"contents": [
			{
				"role": "user",
				"parts": [{"text": request_text}]
			}
		],
		"generationConfig": {
			"temperature": 0.2,
			"topP": 0.9,
			"maxOutputTokens": 4096
		}
	}

	result, used_model, error_data = call_gemini_with_fallback(payload, requested_model)
	if error_data:
		status_code = error_data.pop('statusCode', 502)
		return jsonify(error_data), status_code

	raw_text = clean_gemini_code_output(extract_gemini_text(result))
	if not raw_text:
		return jsonify({'error': 'Gemini returned empty output'}), 502

	parsed = None
	try:
		parsed = json.loads(raw_text)
	except Exception:
		start = raw_text.find('{')
		end = raw_text.rfind('}')
		if start != -1 and end > start:
			try:
				parsed = json.loads(raw_text[start:end+1])
			except Exception:
				parsed = None

	if isinstance(parsed, dict):
		returned_original = str(parsed.get('originalCode') or original_code)
		corrected_code = str(parsed.get('correctedCode') or '').strip()
		if corrected_code:
			return jsonify({
				'originalCode': returned_original,
				'correctedCode': corrected_code,
				'model': used_model,
			})

	return jsonify({
		'originalCode': original_code,
		'correctedCode': raw_text,
		'model': used_model,
	})

@app.route('/editor/<string:room_id>', methods=['GET', 'POST'])
def editor(room_id):
	if request.method == 'POST':
		username = request.form.get('username')
		return render_template('editor.html', room_id=room_id, userName=username)
	else:
		return redirect((url_for("index", room_id = room_id)))

@socketio.on('join')
def handle_join(data):
	print("join")
	room = data['room']
	userName = data['userName']
	join_room(room)
	emit('request_users', {'room': room, 'userName': userName}, to = room, skip_sid = True)  # Request current text from the room
	emit('request_editors', {'room': room}, to = room, skip_sid = True)

@socketio.on('requested_users')
def requested_users(data):
	room = data['room']
	users = data['users']
	emit('create_users', {'room': room, 'users': users}, to = room, skip_sid = True)  # Request current text from the room

@socketio.on('requested_editors')
def requested_editors(data):
	print("render_editors")
	room = data['room']
	currentEditors = data['currentEditors']
	fileCount = data['fileCount']
	print(currentEditors)
	emit('create_editors',{'room':room, 'currentEditors':currentEditors, 'fileCount':fileCount}, to = room, skip_sid = True )

@socketio.on('update_text')
def handle_update(data):
	room = data['room']
	text = data['text']
	currentTextEditorName = data['currentTextEditorName']
	userName = data['userName']
	cursor = data['cursor']
	emit('update_text', {'text': text, 'currentTextEditorName':currentTextEditorName, 'userName':userName, 'cursor':cursor}, to = room, skip_sid = True)   # Broadcast to all users

@socketio.on('create_new_file')
def create_new_file(data):
	print("create_new_file in app.py")
	room      = data['room']
	fileCount = data['fileCount']
	fileName  = data['fileName']
	# parentPath / fullPath are provided by the new nested-creation system.
	# '' / fileName are safe defaults for legacy clients that omit them.
	parentPath = data.get('parentPath', '')
	fullPath   = data.get('fullPath', fileName)
	try:
		parent_abs = resolve_fs_path(parentPath)
		file_abs = resolve_fs_path(fullPath)
		os.makedirs(parent_abs, exist_ok=True)
		os.makedirs(os.path.dirname(file_abs), exist_ok=True)
		if not os.path.exists(file_abs):
			with open(file_abs, 'a', encoding='utf-8'):
				pass
	except Exception as error:
		print(f"create_new_file backend sync error: {error}")

	emit('create_new_file',
	     {'room': room, 'fileCount': fileCount, 'fileName': fileName,
	      'parentPath': parentPath, 'fullPath': fullPath},
	     to=room, skip_sid=True)

@socketio.on('create_new_folder')
def create_new_folder(data):
	room = data['room']
	folderId = data.get('folderId')
	folderName = data.get('folderName', '')
	parentPath = data.get('parentPath', '')
	folderPath = data.get('folderPath', folderName)

	try:
		folder_abs = resolve_fs_path(folderPath)
		os.makedirs(folder_abs, exist_ok=True)
	except Exception as error:
		print(f"create_new_folder backend sync error: {error}")

	emit('create_new_folder',
	     {'room': room, 'folderId': folderId, 'folderName': folderName,
	      'parentPath': parentPath, 'folderPath': folderPath},
	     to=room, skip_sid=True)

@socketio.on('delete_file')
def delete_file(data):
	room = data['room']
	fileId = data['fileId']
	emit('delete_file',{'room':room, 'fileId':fileId}, to = room, skip_sid = True)

@socketio.on('rename_file')
def rename_file(data):
	room = data['room']
	fileId = data['fileId']
	newFileName = data['newFileName']
	emit('rename_file',{'room':room, 'fileId':fileId, 'newFileName':newFileName}, to = room, skip_sid = True)

@socketio.on('rename_folder')
def rename_folder(data):
	room = data['room']
	folderId = data.get('folderId')
	oldPath = data.get('oldPath', '')
	newPath = data.get('newPath', '')
	newName = data.get('newName', '')

	try:
		if oldPath and newPath:
			old_abs = resolve_fs_path(oldPath)
			new_abs = resolve_fs_path(newPath)
			if os.path.exists(old_abs):
				os.makedirs(os.path.dirname(new_abs), exist_ok=True)
				os.rename(old_abs, new_abs)
	except Exception as error:
		print(f"rename_folder backend sync error: {error}")

	emit('rename_folder',
	     {'room': room, 'folderId': folderId, 'oldPath': oldPath,
	      'newPath': newPath, 'newName': newName, 'folderPath': newPath},
	     to=room, skip_sid=True)

@socketio.on('delete_folder')
def delete_folder(data):
	room = data['room']
	folderId = data.get('folderId')
	folderPath = data.get('folderPath', '')

	try:
		if folderPath:
			folder_abs = resolve_fs_path(folderPath)
			if os.path.exists(folder_abs):
				shutil.rmtree(folder_abs)
	except Exception as error:
		print(f"delete_folder backend sync error: {error}")

	emit('delete_folder', {'room': room, 'folderId': folderId, 'folderPath': folderPath}, to=room, skip_sid=True)

def code_exe(language,code,inputVal):

	if language!= "cpp" and language!= "py":
		return "error: Invalid File Extension\nUse cpp or py File Extensions."

	fileName = language+"_code."+language
	sessionId = str(uuid.uuid4())

	folderPath = os.path.join("temp", sessionId)
	filePath = os.path.join(folderPath, fileName)

	os.makedirs(folderPath, exist_ok=True)

	with open(filePath, "w") as f:
		f.write(code)
	f.close()

	try:
		if language == "py":
			execute = subprocess.run(["python3",filePath],timeout=10,input=inputVal,capture_output=True,text=True)
			if execute.returncode!=0:
				if os.path.exists(folderPath):
					shutil.rmtree(folderPath)
				return execute.stderr
			if os.path.exists(folderPath):
				shutil.rmtree(folderPath)
			return execute.stdout
		
		elif language == "cpp":
			command = ["g++", "-o", f"{folderPath}/{fileName}_out", filePath]
			compileCode = subprocess.run(command,capture_output=True,text=True)
			if compileCode.returncode!=0:
				if os.path.exists(folderPath):
					shutil.rmtree(folderPath)
				return compileCode.stderr

			execute = subprocess.run(f"./{folderPath}/{fileName}_out",timeout=10,input=inputVal,capture_output=True,text=True)
			if os.path.exists(folderPath):
				shutil.rmtree(folderPath)
			return execute.stderr if execute.returncode != 0 else execute.stdout
	
	except subprocess.TimeoutExpired:
		if os.path.exists(folderPath):
			shutil.rmtree(folderPath)
		return "Timeout expired. The code execution took too long."

if __name__ == '__main__':
	app.run(host='0.0.0.0', port=5000, debug=True)
