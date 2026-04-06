"""
Rubik Solver — backend Python + frontend con cubo 3D animato.
Dipendenze: kociemba  (pip install kociemba)
Avvio locale:  python server.py
Deploy Render: automatico via render.yaml
"""

import json, os
from collections import Counter
from http.server import BaseHTTPRequestHandler, HTTPServer
import kociemba

FACCE_ORDINE = ['U','R','F','D','L','B']
ORDINE_INPUT = ['U','F','R','B','L','D']
COLORI_NOME  = {'U':'Bianco','R':'Rosso','F':'Verde','D':'Giallo','L':'Arancione','B':'Blu'}
ISTRUZIONI   = {
    'U': 'Posizione iniziale: <b>BIANCO</b> in alto, <b>VERDE</b> davanti.',
    'F': '✓ U salvata — il cubo non si muove. <b>VERDE</b> è già davanti.',
    'R': '✓ F salvata — ruota 90° <b>orario</b> (bianco resta in alto). <b>ROSSO</b> davanti.',
    'B': '✓ R salvata — ruota altri 90° <b>orario</b> (bianco in alto). <b>BLU</b> davanti.',
    'L': '✓ B salvata — ruota altri 90° <b>orario</b> (bianco in alto). <b>ARANCIONE</b> davanti.',
    'D': '✓ L salvata — capovolgi il cubo 180°. <b>GIALLO</b> in alto.',
}
# Render assegna la porta via variabile d'ambiente PORT
PORT       = int(os.environ.get('PORT', 7384))
STATIC_DIR = os.path.join(os.path.dirname(__file__), 'static')
MIME       = {'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8',
              '.css':'text/css; charset=utf-8','.json':'application/json','.ico':'image/x-icon'}

class StatoCubo:
    def __init__(self): self.reset()
    def reset(self):
        self.griglia   = {f:[f if i==4 else '?' for i in range(9)] for f in FACCE_ORDINE}
        self.step      = 0
        self.history   = []
        self.soluzione = None
        self.errore    = None
    @property
    def faccia_attiva(self): return ORDINE_INPUT[self.step] if self.step<len(ORDINE_INPUT) else None
    def to_dict(self):
        return {'griglia':self.griglia,'step':self.step,'faccia_attiva':self.faccia_attiva,
                'istruzione':ISTRUZIONI.get(self.faccia_attiva,''),'ordine_input':ORDINE_INPUT,
                'colori_nome':COLORI_NOME,'contatori':self._contatori(),
                'soluzione':self.soluzione,'errore':self.errore,
                'completato':self.step>=len(ORDINE_INPUT)}
    def _contatori(self):
        tutti=[c for f in FACCE_ORDINE for c in self.griglia[f] if c!='?']
        cnt=Counter(tutti); return {f:cnt.get(f,0) for f in FACCE_ORDINE}
    def dipingi(self,faccia,idx,colore):
        self.errore=None
        if faccia!=self.faccia_attiva: self.errore=f"Puoi modificare solo la faccia attiva: {self.faccia_attiva}"; return
        if idx==4: self.errore="Il centro non è modificabile."; return
        old=self.griglia[faccia][idx]
        if old!=colore: self.history.append((faccia,idx,old)); self.griglia[faccia][idx]=colore
    def undo(self):
        self.errore=None
        if not self.history: self.errore="Nessuna operazione da annullare."; return
        faccia,idx,old=self.history.pop(); self.griglia[faccia][idx]=old
    def conferma_faccia(self):
        self.errore=None; faccia=self.faccia_attiva
        if faccia is None: return
        mancanti=self.griglia[faccia].count('?')
        if mancanti: self.errore=f"Mancano {mancanti} {'cella' if mancanti==1 else 'celle'} nella faccia {faccia}."; return
        self.step+=1; self.history.clear()
        if self.step>=len(ORDINE_INPUT): self._risolvi()
    def _risolvi(self):
        stato=''.join(''.join(self.griglia[f]) for f in FACCE_ORDINE)
        cnt=Counter(stato)
        errori=[f"{COLORI_NOME[f]}: {cnt.get(f,0)}/9" for f in FACCE_ORDINE if cnt.get(f,0)!=9]
        if errori: self.errore="Conteggio errato → "+", ".join(errori); self.step-=1; return
        try:
            self.soluzione=kociemba.solve(stato); print(f"✓ Soluzione: {self.soluzione}")
        except Exception as e: self.errore=f"Errore kociemba: {e}"; self.step-=1

stato=StatoCubo()

class Handler(BaseHTTPRequestHandler):
    def log_message(self,fmt,*args): pass
    def _json(self,obj,code=200):
        body=json.dumps(obj).encode(); self.send_response(code)
        self.send_header('Content-Type','application/json')
        self.send_header('Content-Length',str(len(body)))
        self.send_header('Access-Control-Allow-Origin','*'); self.end_headers(); self.wfile.write(body)
    def _file(self,path):
        ext=os.path.splitext(path)[1]; mime=MIME.get(ext,'application/octet-stream')
        try:
            with open(path,'rb') as f: body=f.read()
            self.send_response(200); self.send_header('Content-Type',mime)
            self.send_header('Content-Length',str(len(body))); self.end_headers(); self.wfile.write(body)
        except FileNotFoundError: self.send_response(404); self.end_headers()
    def do_GET(self):
        if self.path=='/state': self._json(stato.to_dict()); return
        p=self.path.split('?')[0]
        if p=='/': p='/index.html'
        fp=os.path.join(STATIC_DIR,p.lstrip('/'))
        if os.path.isfile(fp): self._file(fp)
        else: self.send_response(404); self.end_headers()
    def do_POST(self):
        length=int(self.headers.get('Content-Length',0))
        body=json.loads(self.rfile.read(length)) if length else {}
        if   self.path=='/dipingi':  stato.dipingi(body['faccia'],int(body['idx']),body['colore'])
        elif self.path=='/undo':     stato.undo()
        elif self.path=='/conferma': stato.conferma_faccia()
        elif self.path=='/reset':    stato.reset()
        else: self.send_response(404); self.end_headers(); return
        self._json(stato.to_dict())
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin','*')
        self.send_header('Access-Control-Allow-Methods','GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers','Content-Type'); self.end_headers()

def main():
    os.makedirs(STATIC_DIR, exist_ok=True)
    server = HTTPServer(('0.0.0.0', PORT), Handler)
    print(f"=== Rubik Solver 3D ===\nServer: http://0.0.0.0:{PORT}\n")
    try: server.serve_forever()
    except KeyboardInterrupt: print("\nServer arrestato.")

if __name__=='__main__': main()
