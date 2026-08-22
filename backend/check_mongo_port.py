import socket
s = socket.socket()
r = s.connect_ex(('127.0.0.1', 27017))
print('MongoDB local port 27017:', 'OPEN' if r == 0 else 'CLOSED')
s.close()
