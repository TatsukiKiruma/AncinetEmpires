import subprocess

cmd = ['npx.cmd', '--prefix', 'env', 'tsx', '-e', 'import { GameEngine } from "./env/src/game/engine"; console.log("Engine in subproc:", !!GameEngine);']
p = subprocess.run(cmd, cwd=r'C:\code\AncinetEmpires\ai_training\r4_teacher_stage_20261013_121700', capture_output=True, text=True, shell=True)
print('STDOUT:', p.stdout)
print('STDERR:', p.stderr)
print('Exit code:', p.returncode)
