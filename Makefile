# Note this is for LG's machine which unexplicably must use sudo to call rust from yarn. :/ 
dev: stop
	sudo yarn tauri dev 

build: stop
	sudo yarn tauri build 

stop:
	NODE_ENV=test sudo killall node | true