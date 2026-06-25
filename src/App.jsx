import { useState, useEffect, useRef } from "react";

const MONTHS_IT = [
  "Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno",
  "Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"
];

const PASTEL = [
  "#FFD6D6","#FFE8C8","#FFF9C4","#D4F1C4","#C4E8F8","#E0D4F8","#FAD4EF","#FADADD",
  "#D6E8FF","#E8D6FF","#D6FFE8","#FFE8D6"
];

funzione shuffle(arr) {
  const a = [...arr];
  per (sia i = a.lunghezza - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  restituisci a;
}

// ── Griglia di default: 7 righe x 7 colonne, banchi attivi a sinistra e destra
// con un corridoio vuoto centrale (colonna 3), esempio tipico di aula ──
funzione buildDefaultGrid() {
  const righe = 7, colonne = 7;
  const celle = {};
  per (sia r = 0; r < righe; r++) {
    per (sia c = 0; c < cols; c++) {
      // riga 0 = davanti (vicino cattedra). Lascia vuota la colonna centrale (corridoio).
      const isCorridor = c === 3;
      const isFrontGap = r === 0; // prima riga vuota = spazio davanti alla cattedra
      celle[`${r}_${c}`] = (!isCorridor && !isFrontGap);
    }
  }
  restituisci { righe, colonne, celle };
}

const DEFAULT_LAYOUT = {
  className: "La Mia Classe",
  inizioAnnoScolastico: { mese: 8, anno: nuovo Date().getFullYear() },
  griglia: buildDefaultGrid(),
  note: "",
  bidPairs: [], // coppie di nomi che non devono mai vedere vicine
  coppie richieste: [], // coppie di nomi che devono sempre vedere vicine
  positionConstraints: {}, // { nomeStudente: "front" | "back" | "aisle" }
};

funzione costruisciAnnoScolastico(inizio) {
  const mesi = [];
  sia { mese, anno } = inizio;
  per (sia i = 0; i < 10; i++) {
    mesi.push({ mese, anno });
    mese++;
    se (mese > 11) { mese = 0; anno++; }
  }
  mesi di ritorno;
}

// Restituisce l'elenco ordinato delle celle ATTIVE (banchi reali), riga per riga
funzione activeCells(griglia) {
  const list = [];
  per (sia r = 0; r < grid.rows; r++) {
    per (lascia c = 0; c < grid.cols; c++) {
      if (grid.cells[`${r}_${c}`]) list.push({ r, c, key: `${r}_${c}` });
    }
  }
  elenco di ritorno;
}

funzione totalPosti(griglia) {
  restituisci activeCells(griglia).lunghezza;
}

// Coppie ADIACENTI orizzontalmente: due banchi attivi in ​​colonne consecutive,
// nella stessa riga, senza corridoio/vuoto tra loro.
funzione adjacentPairKeys(griglia) {
  const pairs = [];
  per (sia r = 0; r < grid.rows; r++) {
    per (lascia c = 0; c < grid.cols - 1; c++) {
      const k1 = `${r}_${c}`, k2 = `${r}_${c + 1}`;
      se (griglia.celle[k1] e griglia.celle[k2]) coppie.push([k1, k2]);
    }
  }
  coppie di ritorno;
}

// La "prima fila" è la riga attiva più vicina alla cattedra (riga con indice minore tra quelle che hanno almeno un banco)
funzione frontRowIndex(griglia) {
  per (sia r = 0; r < grid.rows; r++) {
    per (lascia c = 0; c < grid.cols; c++) {
      se (grid.cells[`${r}_${c}`]) restituisci r;
    }
  }
  restituisci -1;
}

// Ultima riga attiva (più lontana dalla cattedra)
funzione lastRowIndex(griglia) {
  per (sia r = grid.rows - 1; r >= 0; r--) {
    per (lascia c = 0; c < grid.cols; c++) {
      se (grid.cells[`${r}_${c}`]) restituisci r;
    }
  }
  restituisci -1;
}

// Celle "vicino al corridoio": banchi attivi che hanno almeno un lato (sinistra o destra)
// libero/vuoto nella griglia, cioè sono il primo o ultimo banco di un blocco contiguo
funzione aisleAdjacentKeys(griglia) {
  const keys = [];
  per (sia r = 0; r < grid.rows; r++) {
    per (lascia c = 0; c < grid.cols; c++) {
      se (!grid.cells[`${r}_${c}`]) continua;
      const leftFree = !grid.cells[`${r}_${c - 1}`];
      const rightFree = !grid.cells[`${r}_${c + 1}`];
      se (sinistraLibera || destraLibera) tasti.push(`${r}_${c}`);
    }
  }
  tasti di ritorno;
}

// Piccolo selettore per aggiungere una coppia vietata (due menu a tendina + pulsante)
funzione ForbiddenPairAdder({ studenti, onAdd }) {
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  ritorno (
    <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
      <select value={a} onChange={e => setA(e.target.value)} style={{
        padding:"6px 10px", borderRadius:8, border:"1.5px solid #4a6fa5", fontFamily:"Georgia,serif", fontSize:13, color:"#2c3e6b"
      }}>
        <option value="">Studente A...</option>
        {students.map(s => <option key={s} value={s}>{s}</option>)}
      </seleziona>
      <span style={{ color:"#aaa" }}>↔</span>
      <select value={b} onChange={e => setB(e.target.value)} style={{
        padding:"6px 10px", borderRadius:8, border:"1.5px solid #4a6fa5", fontFamily:"Georgia,serif", fontSize:13, color:"#2c3e6b"
      }}>
        <option value="">Studente B...</option>

        {students.map(s => <option key={s} value={s}>{s}</option>)}
      </seleziona>
      <button onClick={() => { if (a && b && a !== b) { onAdd(a, b); setA(""); setB(""); } }} style={{
        background:"#4a6fa5", color:"#fff", border:"none", borderRadius:8, padding:"6px 14px", fontSize:12, fontFamily:"Georgia,serif"
      }}>+ Aggiungi divieto</button>
    </div>
  );
}

funzione ClassRoom({ classId, initialName, onNameChange }) {
  const [setupDone, setSetupDone] = useState(false);
  const [layout, setLayout] = useState(DEFAULT_LAYOUT);
  const [studenti, setStudents] = useState([]);
  const [neverAdjacentStudents, setNeverAdjacentStudents] = useState([]);
  const [tab, setTab] = useState("layout");
  const [mese, impostaMese] = usaStato(DEFAULT_LAYOUT.inizioAnnoScolastico.mese);
  const [anno, impostaAnno] = usaStato(DEFAULT_LAYOUT.schoolYearStart.year);
  const [history, setHistory] = useState({});
  const [assegnazione, impostaAssegnazione] = usaStato(null);
  const [manualMap, setManualMap] = useState({});
  const [editingIdx, setEditingIdx] = useState(null);
  const [editVal, setEditVal] = useState("");
  const [confirmDeleteKey, setConfirmDeleteKey] = useState(null);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const [notice, setNotice] = useState(null);
  const [exporting, setExporting] = useState(false);
  const piantinaRef = useRef(null);

  useEffect(() => {
    se (!classId) restituisci;
    Tentativo {
      const savedSetup = localStorage.getItem(`cd_${classId}_setup_done`);
      const savedLayout = localStorage.getItem(`cd_${classId}_layout`);
      const savedStudents = localStorage.getItem(`cd_${classId}_students`);
      const savedMales = localStorage.getItem(`cd_${classId}_never_adj`);
      const savedHistory = localStorage.getItem(`cd_${classId}_history`);

      se (savedSetup === "true") impostaSetupDone(true);
      se (layout salvato) {
        const parsed = JSON.parse(savedLayout);
        setLayout(analizzato);
        setMonth(parsed.schoolYearStart.month);
        setYear(parsed.schoolYearStart.year);
      } altrimenti se (initialName) {
        // Prima apertura: usa il nome inserito nell'elenco classi
        setLayout(prev => ({ ...prev, className: initialName }));
      }
      se (savedStudents) impostaStudents(JSON.parse(savedStudents));
      se (savedMales) impostaNeverAdjacentStudents(JSON.parse(savedMales));
      se (savedHistory) impostaHistory(JSON.parse(savedHistory));
    } presa {}
  }, []);

  useEffect(() => {
    const key = `${year}_${month}`;
    se (cronologia[chiave]) {
      setAssegnazione(cronologia[chiave]);
      setManualMap({ ...history[key].map });
    } altro {
      setAssignment(null);
      setManualMap({});
    }
  }, [mese, anno, cronologia, classId]);

  funzione persistLayout(l) {
    setLayout(l);
    try { localStorage.setItem(`cd_${classId}_layout`, JSON.stringify(l)); } catch {}
  }
  funzione persistStudents(s) {
    setStudents(s);
    try { localStorage.setItem(`cd_${classId}_students`, JSON.stringify(s)); } catch {}
  }
  funzione persistNeverAdjacent(m) {
    setNeverAdjacentStudents(m);
    try { localStorage.setItem(`cd_${classId}_never_adj`, JSON.stringify(m)); } catch {}
  }
  funzione salvaCronologia(h) {
    setHistory(h);
    try { localStorage.setItem(`cd_${classId}_history`, JSON.stringify(h)); } catch {}
  }
  funzione completeSetup() {
    setSetupDone(true);
    try { localStorage.setItem(`cd_${classId}_setup_done`, "true"); } catch {}
    setMonth(layout.schoolYearStart.month);
    setYear(layout.schoolYearStart.year);
  }

  const schoolYear = buildSchoolYear(layout.schoolYearStart);
  const seats = totalSeats(layout.grid);
  const cellsOrdered = activeCells(layout.grid);

  funzione buildPairs(map) {
    const pairKeys = adjacentPairKeys(layout.grid);
    const pairs = [];
    pairKeys.forEach(([k1, k2]) => {
      const a = map[k1], b = map[k2];
      se (a && b) coppie.push([a, b].sort());
    });
    coppie di ritorno;
  }

  // Controlla sia il gruppo "Mai vicini" (nessuna coppia di studenti dello stesso gruppo adiacente)
  // sia eventuali coppie specifiche vietate definite dal docente nelle Impostazioni
  funzione checkForbiddenAdjacency(map) {
    const pairKeys = adjacentPairKeys(layout.grid);
    const forbidden = layout.forbiddenPairs || [];
    per (costante [k1, k2] di coppie di chiavi) {
      const a = map[k1], b = map[k2];
      se (!a || !b) continua;
      se (neverAdjacentStudents.length > 0 && neverAdjacentStudents.includes(a) && neverAdjacentStudents.includes(b)) restituisci false;
      const isForbidden = forbidden.some(([x, y]) =>
        (x === a && y === b) || (x === b && y === a)
      );
      se (isForbidden) restituisci falso;
    }
    restituisci vero;
  }

  // Controlla che le coppie "sempre vicine" siano effettivamente adiacenti nella disposizione
  funzione checkRequiredPairs(map) {
    const required = layout.requiredPairs || [];
    se (required.length === 0) restituisci true;
    const pairKeys = adjacentPairKeys(layout.grid);
    restituisci richiesto.ogni(([x, y]) => {
      restituisci pairKeys.some(([k1, k2]) => {
        const a = map[k1], b = map[k2];
        restituisci (a === x && b === y) || (a === y && b === x);
      });
    });
  }

  // Controlla i vincoli di posizione: prima fila, ultima fila, o vicino al corridoio
  // Restituisce le righe attive della griglia in ordine (dalla cattedra in poi)
  funzione activeRows() {
    const rows = new Set();
    per (lascia r = 0; r < layout.grid.rows; r++) {
      per (lascia c = 0; c < layout.grid.cols; c++) {
        se (layout.grid.cells[`${r}_${c}`]) righe.aggiungi(r);
      }
    }
    restituisci Array.from(rows).sort((a,b) => ab);
  }

  funzione checkPositionConstraints(map) {
    const vincoli = layout.positionConstraints || {};
    const names = Object.keys(vincoli);
    se (names.length === 0) restituisci true;
    const rows = activeRows();

    per (nome costante di nomi) {
      const type = constraints[name]; // "row_0", "row_1", ecc.
      se (!students.include(name)) continua;
      const seatKey = Object.keys(map).find(k => map[k] === name);
      se (!seatKey) continua;
      const [r] = seatKey.split("_").map(Number);
      se (type.startsWith("row_")) {
        const targetRigaIdx = Numero(tipo.split("_")[1]); // indice nell'array righe attive
        const targetRow = rows[targetRowIdx];
        se (targetRow === undefined) continua;
        se (r !== targetRow) restituisci falso;
      }
    }
    restituisci vero;
  }

  funzione getFrontRowStudents(map) {
    const front = [];
    const fr = frontRowIndex(layout.grid);
    se (fr < 0) restituisci fronte;
    per (lascia c = 0; c < layout.grid.cols; c++) {
      const key = `${fr}_${c}`;
      se (layout.grid.cells[key] && map[key]) front.push(map[key]);
    }
    ritorno anteriore;
  }

  funzione prevMonthKey(y, m) {
    se (m === 0) restituisci `${y - 1}_11`;
    restituisci `${y}_${m - 1}`;
  }

  funzione checkRowRotation(map, y, m) {
    const prev = history[prevMonthKey(y, m)];
    se (!prev) restituisce vero;
    const prevFront = getFrontRowStudents(prev.map);
    se (prevFront.length === 0) restituisci vero;
    const newFront = getFrontRowStudents(map);
    restituisci newFront.every(n => !prevFront.includes(n));
  }

  funzione countRepeatedPairs(map, y, m) {
    const newPairs = buildPairs(map);
    lascia ripetuto = 0;
    const currentKey = `${y}_${m}`;
    Object.entries(history).forEach(([key, prev]) => {
      se (chiave === chiave corrente) restituisci;
      newPairs.forEach(pair => {
        (coppie precedenti || []).perogni(vecchiacoppia => {
          se (coppia[0] === vecchiaPair[0] e coppia[1] === vecchiaPair[1]) ripetuto++;
        });
      });
    });
    restituire ripetuto;
  }

  funzione countRepeatedPrevMonth(map, y, m) {
    const prev = history[prevMonthKey(y, m)];
    se (!prev) restituisci 0;
    const newPairs = buildPairs(map);
    lascia ripetuto = 0;
    newPairs.forEach(pair => {
      (coppie precedenti || []).perogni(vecchiacoppia => {
        se (coppia[0] === vecchiaPair[0] e coppia[1] === vecchiaPair[1]) ripetuto++;
      });
    });
    restituire ripetuto;
  }

  // Genera un singolo tentativo di disposizione rispettando, quando possibile,
  // i vincoli di posizione e le coppie "sempre vicine", prima di mescolare il resto.
  funzione buildAttempt() {
    const keys = cellsOrdered.map(c => c.key);
    const map = {};
    const usedKeys = new Set();
    const usedStudents = new Set();

    const fr = frontRowIndex(layout.grid);
    const lr = lastRowIndex(layout.grid);
    const aisleKeys = aisleAdjacentKeys(layout.grid);
    const vincoli = layout.positionConstraints || {};
    const required = layout.requiredPairs || [];

    const activeRowList = [];
    per (lascia r = 0; r < layout.grid.rows; r++) {
      per (lascia c = 0; c < layout.grid.cols; c++) {
        if (layout.grid.cells[`${r}_${c}`]) { activeRowList.push(r); break; }
      }
    }
    const uniqueActiveRows = [...new Set(activeRowList)].sort((a,b)=>ab);

    funzione keysForType(type) {
      se (type.startsWith("row_")) {
        const rowIdx = Number(type.split("_")[1]);
        const targetRow = uniqueActiveRows[rowIdx];
        se (targetRow === undefined) restituisci [];
        restituisci keys.filter(k => Number(k.split("_")[0]) === targetRow && !usedKeys.has(k));
      }
      ritorno [];
    }

    // 1) Piazza prima gli studenti con vincolo di posizione (ordine casuale tra loro)
    // Prima i vincoli "aisle" (più difficili da soddisfare perché i posti sono meno),
    // poi fronte/retro, così riduciamo i conflitti tra vincolati
    const constrainedNames = shuffle(Object.keys(constraints).filter(n => students.includes(n)))
;
    constrainedNames.forEach(name => {
      se (usedStudents.has(name)) restituisci;
      // Prima prova solo tra le celle libere del tipo richiesto
      lascia candidati = shuffle(keysForType(constraints[name]));
      // Se non ce ne sono libere, prova tra tutte le celle del tipo (ignora usedKeys)
      // checkPositionConstraints farà da guardia finale
      se (candidati.lunghezza === 0) {
        const allOfType = keys.filter(k => {
          const tipo = vincoli[nome];
          se (type.startsWith("row_")) {
            const rowIdx = Number(type.split("_")[1]);
            const targetRow = uniqueActiveRows[rowIdx];
            restituisci Number(k.split("_")[0]) === targetRow;
          }
          restituire falso;
        });
        candidati = mescola(tuttiDiTipo);
      }
      se (candidati lunghezza > 0) {
        const key = candidates[0];
        mappa[chiave] = nome;
        tasti_utilizzati_aggiungi(tasto);
        usedStudents.add(name);
      }
    });

    // 2) Piazza le coppie "sempre vicine" sui banchi adiacenti rimasti liberi
    const pairKeysAll = shuffle(adjacentPairKeys(layout.grid));
    mescola(obbligatorio).perogni(([x, y]) => {
      se (usedStudents.has(x) || usedStudents.has(y)) restituisci;
      se (!students.includes(x) || !students.includes(y)) restituisci;
      const freePair = pairKeysAll.find(([k1, k2]) => !usedKeys.has(k1) && !usedKeys.has(k2));
      se (freePair) {
        const [k1, k2] = freePair;
        // ordine casuale tra i due studenti nella coppia
        const [first, second] = Math.random() < 0.5 ? [x, y] : [y, x];
        mappa[k1] = primo; mappa[k2] = secondo;
        usedKeys.add(k1); usedKeys.add(k2);
        usedStudents.add(x); usedStudents.add(y);
      }
    });

    // 3) Mescola tutti gli studenti rimanenti nei banchi rimanenti
    const remainingStudents = shuffle(students.filter(s => !usedStudents.has(s)));
    const remainingKeys = keys.filter(k => !usedKeys.has(k));
    remainingKeys.forEach((k, idx) => { map[k] = remainingStudents[idx] || ""; });

    mappa di ritorno;
  }

  funzione tryGenerate(tentativi, punteggioFn) {
    lascia best = null, bestScore = Infinity;
    per (sia i = 0; i < tentativi; i++) {
      const map = buildAttempt();
      se (!checkForbiddenAdjacency(map)) continua;
      se (!checkRequiredPairs(map)) continua;
      se (!checkPositionConstraints(map)) continua;
      se (!checkRowRotation(mappa, anno, mese)) continua;
      const score = scoreFn(map);
      se (punteggio < migliorPunteggio) {
        migliorPunteggio = punteggio;
        migliore = mappa;
        se (punteggio === 0) interrompi;
      }
    }
    restituisci { mappa: migliore, punteggio: punteggiomigliore };
  }

  funzione genera() {
    se (studenti.lunghezza === 0) {
      setNotice({ type: "error", text: "Aggiungi prima gli studenti nella tab Studenti." });
      ritorno;
    }
    se (posti === 0) {
      setNotice({ type: "error", text: "Nessun banco configurato. Vai in Impostazioni e attiva le celle che rappresentano i banchi." });
      ritorno;
    }
    se (numero di studenti > numero di posti) {
      setNotice({ type: "error", text: `Hai ${students.length} studenti ma solo ${seats} posti disponibili. Aggiungi banchi nelle Impostazioni.` });
      ritorno;
    }

    const fase1 = tryGenerate(3000, m => countRepeatedPairs(m, anno, mese));
    lascia che finalMap, finalScore, avvisi = false;

    se (fase1.map && fase1.score === 0) {
      finalMap = fase1.map; punteggio finale = 0;
    } altro {
      const fase2 = tryGenerate(1500, m => countRepeatedPrevMonth(m, anno, mese));
      se (fase2.map && fase2.score === 0) {
        finalMap = fase2.map;
        punteggiofinale = conteggioCoppieRipetute(mappafinale, anno, mese);
      } altro {
        const candidates = [fase1.map, fase2.map].filter(Boolean);
        se (candidati.lunghezza === 0) {
          setNotice({ type: "error", text: "Non è stato possibile generare una disposizione valida. Controlla che i vincoli di posizione e le coppie sempre/mai vicine nelle vicinanze Impostazioni non siano in conflitto tra loro o con il numero di posti disponibili." });
          ritorno;
        }
        finalMap = candidates.reduce((best, m) => {
          const s = countRepeatedPairs(m, anno, mese);
          restituisci (best === null || s < countRepeatedPairs(best, anno, mese)) ? m : best;
        }, null);
        punteggiofinale = conteggioCoppieRipetute(mappafinale, anno, mese);
        avviso = punteggio finale > 0;
      }
    }

    const coppie = buildPairs(finalMap);
    const newAssignment = { mese, anno, mappa: finalMap, coppie };
    const key = `${year}_${month}`;
    const newHistory = { ...history, [key]: newAssignment };
    salvaCronologia(nuovaCronologia);
    setAssegnazione(nuovaAssegnazione);

    se (avviso) {
      setNotice({ type: "warning", text: `${finalScore} coppie adiacenti si ripetono rispetto allo storico. Migliorerà nei prossimi mesi.` });
    }
  }

  funzione clearMonth() {
    const key = `${year}_${month}`;
    const newHistory = { ...history };
    elimina newHistory[key];
    salvaCronologia(nuovaCronologia);
    setAssignment(null);
  }

  funzione deleteHistoryMonth(chiave) {
    const newHistory = { ...history };
    elimina newHistory[key];
    salvaCronologia(nuovaCronologia);
    const [y, m] = key.split("_").map(Number);
    se (y === anno && m === mese) impostaAssegnazione(null);
    setConfirmDeleteKey(null);
  }

  funzione clearAllHistory() {
    salvaCronologia({});
    setAssignment(null);
    setConfirmDeleteAll(false);
  }

  funzione getSeatStudent(chiave) {
    se (!assegnazione) restituisci null;
    restituisci assignment.map[key] || null;
  }

  // Colore per "gruppo di banchi contigui" (blocco), non per singola coppia,
  // così un blocco di 3-4 banchi adiacenti ha un colore uniforme
  funzione groupIndexFor(key) {
    se (!assegnazione) restituisci -1;
    // Trova il blocco contiguo orizzontale a cui appartiene questa cella
    const [r, c] = key.split("_").map(Number);
    sia startC = c;
    mentre (layout.grid.cells[`${r}_${startC - 1}`]) startC--;
    return r * 100 + startC; // identificatore univoco del blocco, usato come indice colore
  }

  funzione asincrona exportAsImage() {
    se (!piantinaRef.current) restituisci;
    setExporting(true);
    Tentativo {
      se (!window.html2canvas) {
        attendi nuova Promise((risolvi, rifiuta) => {
          const script = document.createElement("script");
          script.src = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
          script.onload = resolve;
          script.onerror = rifiuta;
          document.body.appendChild(script);
        });
      }
      const canvas = attendono window.html2canvas(piantinaRef.current, { backgroundColor: "#ffffff", scale: 2 });
      const link = document.createElement("a");
      link.download = `disposizione_${layout.className.replace(/\s+/g, "_"}_${MONTHS_IT[month]}_${year}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } presa {
      setNotice({ type: "error", text: "Non è stato possibile generare l'immagine. Riprova." });
    } Finalmente {
      setExporting(false);
    }
  }

  funzione salvaManuale() {
    const pairs = buildPairs(manualMap);
    const newAssignment = { mese, anno, mappa: { ...manualMap }, coppie };
    const key = `${year}_${month}`;
    const newHistory = { ...history, [key]: newAssignment };
    salvaCronologia(nuovaCronologia);
    setAssegnazione(nuovaAssegnazione);
    setTab("layout");
  }

  funzione getPairStats() {
    const counts = {};
    const sortedKeys = Object.keys(history).sort((k1, k2) => {
      const [y1, m1] = k1.split("_").map(Number);
      const [y2, m2] = k2.split("_").map(Number);
      restituisci (y1 * 12 + m1) - (y2 * 12 + m2);
    });
    sortedKeys.forEach(key => {
      const [y, m] = key.split("_").map(Number);
      const entry = history[key];
      (entry.pairs || []).forEach(pair => {
        const sorted = [...pair].sort();
        const k = `${sorted[0]}||${sorted[1]}`;
        se (!counts[k]) counts[k] = { a: sorted[0], b: sorted[1], count: 0, lastMonth: m, lastYear: y };
        counts[k].count++;
        counts[k].lastMonth = m;
        counts[k].lastYear = y;
      });
    });
    restituisci Object.values(counts).sort((x, y) => y.count - x.count);
  }

  funzione statColor(count) {
    se (conteggio >= 4) restituisci "#FFD6D6";
    se (conteggio === 3) restituisci "#FFE8C8";
    se (conteggio === 2) restituisci "#FFF9C4";
    restituisci "#E8F5E0";
  }

  const historyKeys = Object.keys(history).sort().reverse();

  // ── Editor griglia cliccabile per le Impostazioni ──
  funzione renderGridEditor() {
    funzione toggleCell(r, c) {
      const key = `${r}_${c}`;
      const newCells = { ...layout.grid.cells, [key]: !layout.grid.cells[key] };
      persistLayout({ ...layout, grid: { ...layout.grid, cells: newCells } });
    }
    funzione ridimensionaGrid(dRows, dCols) {
      const newRows = Math.max(1, Math.min(20, layout.grid.rows + dRows));
      const newCols = Math.max(1, Math.min(20, layout.grid.cols + dCols));
      const newCells = {};
      per (sia r = 0; r < newRows; r++) {
        per (lascia c = 0; c < newCols; c++) {
          newCells[`${r}_${c}`] = layout.grid.cells[`${r}_${c}`] || false;
        }
      }
      persistLayout({ ...layout, grid: { rows: newRows, cols: newCols, cells: newCells } });
    }
    funzione clearGrid() {
      const newCells = {};
      per (lascia r = 0; r < layout.grid.rows; r++) {
        per (lascia c = 0; c < layout.grid.cols; c++) newCells[`${r}_${c}`] = false;
      }
      persistLayout({ ...layout, grid: { ...layout.grid, cells: newCells } });
    }
    funzione fillGrid() {
      const newCells = {};
      per (lascia r = 0; r < layout.grid.rows; r++) {
        per (lascia c = 0; c < layout.grid.cols; c++) newCells[`${r}_${c}`] = true;
      }
      persistLayout({ ...layout, grid: { ...layout.grid, cells: newCells } });
    }

    ritorno (
      <div style={{ background:"#fff", borderRadius:12, padding:"16px 18px", marginBottom:16, boxShadow:"0 1px 8px #0001" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6, flexWrap:"wrap", gap:8 }}>
          <label style={{ fontSize:12, color:"#888", fontWeight:"bold" }}>DISPOSIZIONE BANCHI ({seats} posti attivi)</label>
        </div>
        <div style={{ fontSize:12, color:"#aaa", marginBottom:12 }}>
          Toccare una cella per attivarla (banco) o disattivarla (corridoio/vuoto). La cattedra è in alto.
        </div>

        {/* Controllo dimensione griglia */}
        <div style={{ display:"flex", gap:16, marginBottom:14, flexWrap:"wrap" }}>
          <div style={{ display:"flex", alignItems:"center", gap:6 }}>
            <span style={{ fontSize:12, color:"#666" }}>Rigo:</span>
            <button onClick={() => resizeGrid(-1, 0)} style={smallBtnStyle}>−</button>
            <span style={{ width:24, textAlign:"center", fontWeight:"bold", color:"#2c3e6b" }}>{layout.grid.rows}</span>
            <button onClick={() => resizeGrid(1, 0)} style={smallBtnStyle}>+</button>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:6 }}>
            <span style={{ fontSize:12, color:"#666" }}>Colonna:</span>
            <button onClick={() => resizeGrid(0, -1)} style={smallBtnStyle}>−</button>
            <span style={{ width:24, textAlign:"center", fontWeight:"bold", color:"#2c3e6b" }}>{layout.grid.cols}</span>
            <button onClick={() => resizeGrid(0, 1)} style={smallBtnStyle}>+</button>
          </div>
          <button onClick={clearGrid} style={{ ...smallBtnStyle, width:"auto", padding:"0 10px", fontSize:11, color:"#c0392b" }}>Svuota tutto</button>
          <button onClick={fillGrid} style={{ ...smallBtnStyle, width:"auto", padding:"0 10px", fontSize:11, color:"#27ae60" }}>Riempi tutto</button>
        </div>

        {/* Cattedra indicativa */}
        <div style={{ textAlign:"center", marginBottom:10 }}>
          <div style={{ display:"inline-block", background:"#2c3e6b", color:"#fff", borderRadius:6, padding:"4px 20px", fontSize:11, letterSpacing:1 }}>🖥 CATTEDRA</div>
        </div>

        {/* Griglia */}
        <div style={{ display:"flex", flexDirection:"column", gap:4, alignItems:"center", overflowX:"auto", padding:"4px 0" }}>
          {Array.from({ lunghezza: layout.grid.rows }, (_, r) => (
            <div key={r} style={{ display:"flex", gap:4 }}>
              {Array.from({ lunghezza: layout.grid.cols }, (_, c) => {
                const active = layout.grid.cells[`${r}_${c}`];
                ritorno (
                  <pulsante
                    chiave={c}
                    onClick={() => toggleCell(r, c)}
                    stile={{
                      larghezza:30, altezza:30, raggio del bordo:6,
                      bordo: attivo ? "2px solido #4a6fa5" : "1px tratteggiato #ddd",
                      background: attivo ? "#C4E8F8" : "#fafafa",
                      cursore:"puntatore", spaziatura:0,
                      transizione:"tutti .1s"
                    }}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
    );
  }

  const smallBtnStyle = {
    larghezza:26, altezza:26, raggio del bordo:6, bordo:"1px solido #ccc",
    background:"#f5f5f5", fontSize:14, color:"#2c3e6b"
  };

  funzione renderSettings() {
    ritorno (
      <div>
        <div style={{ fontWeight:"bold", color:"#2c3e6b", fontSize:18, marginBottom:6 }}>⚙️ Impostazioni classe</div>
        <div style={{ color:"#888", fontSize:13, marginBottom:20 }}>
          Configura nome classe, anno scolastico e disposizione fisica dei banchi.
        </div>

        <div style={{ background:"#fff", borderRadius:12, padding:"16px 18px", marginBottom:16, boxShadow:"0 1px 8px #0001" }}>
          <label style={{ fontSize:12, color:"#888", fontWeight:"bold" }}>NOME CLASSE</label>
          <input
            valore={layout.className}
            onChange={e => {
              persistLayout({ ...layout, className: e.target.value });
              se (onNameChange) onNameChange(e.target.value);
            }}
            stile={{ larghezza:"100%", margine superiore:6, spaziatura interna:"8px 12px", raggio del bordo:8,
              bordo:"1,5px solido #4a6fa5", fontFamily:"Georgia,serif", fontSize:15, colore:"#2c3e6b",
              boxSizing:"border-box" }}
          />
        </div>

        <div style={{ background:"#fff", borderRadius:12, padding:"16px 18px", marginBottom:16, boxShadow:"0 1px 8px #0001" }}>
          <label style={{ fontSize:12, color:"#888", fontWeight:"bold" }}>MESE DI INIZIO ANNO SCOLASTICO</label>
          <div style={{ display:"flex", gap:10, marginTop:6 }}>
            <seleziona
              valore={layout.schoolYearStart.month}
              onChange={e => persistLayout({ ...layout, schoolYearStart: { ...layout.schoolYearStart, month: Number(e.target.value) } })}
              style={{ flex:1, padding:"8px 12px", borderRadius:8, border:"1.5px solid #4a6fa5", fontFamily:"Georgia,serif", fontSize:14, color:"#2c3e6b" }}
            >
              {MONTHS_IT.map((m,i) => <option key={i} value={i}>{m}</option>)}
            </seleziona>
            <input
              tipo="numero"
              valore={layout.schoolYearStart.year}
              onChange={e => persistLayout({ ...layout, schoolYearStart: { ...layout.schoolYearStart, year: Number(e.target.value) } })}
              style={{ width:90, padding:"8px 12px", borderRadius:8, border:"1.5px solid #4a6fa5", fontFamily:"Georgia,serif", fontSize:14, color:"#2c3e6b" }}
            />
          </div>
          <div style={{ fontSize:11, color:"#aaa", marginTop:6 }}>L'app genererà 10 mesi a partire da qui.</div>
        </div>

        {renderGridEditor()}

        {/*Coppie da non vedere mai vicine */}
        <div style={{ background:"#fff", borderRadius:12, padding:"16px 18px", marginBottom:16, boxShadow:"0 1px 8px #0001" }}>
          <label style={{ fontSize:12, color:"#888", fontWeight:"bold" }}>STUDENTI DA NON SEDERE MAI VICINI</label>
          <div style={{ fontSize:12, color:"#aaa", marginTop:4, marginBottom:10 }}>
            Scegli coppie specifiche di studenti che non devono mai essere seduti uno accanto all'altro (es. perché litigano).
          </div>
          {(layout.forbiddenPairs || []).map((pair, i) => (
            <div key={i} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
              <div style={{ flex:1, background:"#fdecea", borderRadius:8, padding:"6px 12px", fontSize:13, color:"#c0392b" }}>
                {coppia[0]} ↔ {coppia[1]}
              </div>
              <button onClick={() => {
                const newPairs = layout.forbiddenPairs.filter((_, idx) => idx !== i);
                persistLayout({ ...layout, forbiddenPairs: newPairs });
              }} style={{ background:"transparent", color:"#c0392b", border:"1px solid #c0392b", borderRadius:6, padding:"4px 10px", fontSize:12 }}>✕</button>
            </div>
          ))}
          {studenti lunghezza >= 2 ? (
            <ForbiddenPairAdder students={students} onAdd={(a, b) => {
              const current = layout.forbiddenPairs || [];
              const exists = current.some(([x,y]) => (x===a&&y===b)||(x===b&&y===a));
              se (!esiste e a !== b) {
                persistLayout({ ...layout, forbiddenPairs: [...current, [a, b]] });
              }
            }} />
          ) : (
            <div style={{ fontSize:12, color:"#aaa", fontStyle:"italic" }}>Aggiungi almeno 2 studenti nella scheda Studenti per usare questa funzione.</div>
          )}
        </div>

        {/*Coppie da sedere sempre vicine */}
        <div style={{ background:"#fff", borderRadius:12, padding:"16px 18px", marginBottom:16, boxShadow:"0 1px 8px #0001" }}>
          <label style={{ fontSize:12, color:"#888", fontWeight:"bold" }}>STUDENTI DA SEDERE SEMPRE VICINI</label>
          <div style={{ fontSize:12, color:"#aaa", marginTop:4, marginBottom:10 }}>
            Scegli coppie specifiche di studenti che devono sempre essere seduti uno accanto all'altro (es. per supporto didattico).
          </div>
          {(layout.requiredPairs || []).map((pair, i) => (
            <div key={i} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
              <div style={{ flex:1, background:"#eafaf1", borderRadius:8, padding:"6px 12px", fontSize:13, color:"#1e8449" }}>
                {coppia[0]} ↔ {coppia[1]}
              </div>
              <button onClick={() => {
                const newPairs = layout.requiredPairs.filter((_, idx) => idx !== i);
                persistLayout({ ...layout, requiredPairs: newPairs });
              }} style={{ background:"transparent", color:"#1e8449", border:"1px solid #1e8449", borderRadius:6, padding:"4px 10px", fontSize:12 }}>✕</button>
            </div>
          ))}
          {studenti lunghezza >= 2 ? (
            <ForbiddenPairAdder students={students} onAdd={(a, b) => {
              const current = layout.requiredPairs || [];
              const exists = current.some(([x,y]) => (x===a&&y===b)||(x===b&&y===a));
              se (!esiste e a !== b) {
                persistLayout({ ...layout, requiredPairs: [...current, [a, b]] });
              }
            }} />
          ) : (
            <div style={{ fontSize:12, color:"#aaa", fontStyle:"italic" }}>Aggiungi almeno 2 studenti nella scheda Studenti per usare questa funzione.</div>
          )}
        </div>

        {/* Vincoli di posizione per singolo studente */}
        <div style={{ background:"#fff", borderRadius:12, padding:"16px 18px", marginBottom:16, boxShadow:"0 1px 8px #0001" }}>
          <label style={{ fontSize:12, color:"#888", fontWeight:"bold" }}>POSIZIONE FISSA PER STUDENTE</label>
          <div style={{ fontSize:12, color:"#aaa", marginTop:4, marginBottom:10 }}>
            Vincola uno studente a stare sempre in prima fila, ultima fila, o vicino al corridoio (es. per esigenze di vista, uscite frequenti).
          </div>
          {studenti lunghezza === 0 ? (
            <div style={{ fontSize:12, color:"#aaa", fontStyle:"italic" }}>Aggiungi prima gli studenti nella scheda Studenti.</div>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {studenti.mappa(nome => {
                const current = (layout.positionConstraints || {})[name] || "";
                ritorno (
                  <div key={name} style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <div style={{ flex:1, fontSize:13, color:"#2c3e6b" }}>{nome}</div>
                    <seleziona
                      valore={attuale}
                      onChange={e => {
                        const newConstraints = { ...(layout.positionConstraints || {}) };
                        se (e.target.value) newConstraints[name] = e.target.value;
                        altrimenti elimina newConstraints[name];
                        persistLayout({ ...layout, positionConstraints: newConstraints });
                      }}
                      style={{ padding:"5px 10px", borderRadius:8, border:"1.5px solid #4a6fa5", fontFamily:"Georgia,serif", fontSize:12, color:"#2c3e6b" }}
                    >
                      <option value="">Nessun vincolo</option>
                      {(() => {
                        const righe = [];
                        per (lascia r = 0; r < layout.grid.rows; r++) {
                          per (lascia c = 0; c < layout.grid.cols; c++) {
                            if (layout.grid.cells[`${r}_${c}`]) { rows.push(r); break; }
                          }
                        }
                        const unique = [...new Set(rows)].sort((a,b)=>ab);
                        restituisci unique.map((rowVal, idx) => (
                          <option key={idx} value={`row_${idx}`}>Fila {idx+1}</option>
                        ));
                      })()}
                    </seleziona>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/*Note libere del docente */}
        <div style={{ background:"#fff", borderRadius:12, padding:"16px 18px", marginBottom:16, boxShadow:"0 1px 8px #0001" }}>
          <label style={{ fontSize:12, color:"#888", fontWeight:"bold" }}>NOTE PERSONALI</label>
          <div style={{ fontSize:12, color:"#aaa", marginTop:4, marginBottom:8 }}>
            Promemoria libero, visibile solo a te. Non influenza la generazione automatica.
          </div>
          <area di testo
            valore={layout.notes || ""}
            onChange={e => persistLayout({ ...layout, notes: e.target.value })}
            placeholder="Es. Ricordarsi di controllare con il collega di sostegno prima di cambiare Luca..."
            righe={4}
            style={{ width:"100%", padding:"10px 12px", borderRadius:8, border:"1.5px solid #4a6fa5",
              fontFamily:"Georgia,serif", fontSize:14, color:"#2c3e6b", resize:"vertical" }}
          />
        </div>
      </div>
    );
  }

  se (!setupDone) {
    ritorno (
      <div style={{
        minHeight: "100vh", background: "linear-gradient(135deg, #f8f4ef 0%, #eef3f8 100%)",
        fontFamily: "'Georgia', serif", padding: "30px 16px"
      }}>
        <div style={{ maxWidth: 600, margin: "0 auto" }}>
          <div style={{ textAlign:"center", marginBottom:24 }}>
            <div style={{ fontSize:32, fontWeight:"bold", color:"#2c3e6b" }}>🏫 ClassDesk</div>
            <div style={{ fontSize:14, color:"#888", marginTop:6 }}>Configura la tua classe per iniziare</div>
          </div>
          <div style={{ background:"#fff", borderRadius:16, padding:24, boxShadow:"0 4px 20px #0001" }}>
            {renderSettings()}
            <button onClick={completeSetup} style={{
              larghezza:"100%", margine superiore:10, sfondo:"#2c3e6b", colore:"#fff", bordo:"nessuno",
              borderRadius:10, padding:"12px", fontFamily:"Georgia,serif", fontSize:16, fontWeight:"bold"
            }}> ✓ Inizia a usare l'app</button>
            <div style={{ fontSize:11, color:"#aaa", marginTop:10, textAlign:"center" }}>
              Potrai aggiungere gli studenti nella scheda successiva, e modificare queste impostazioni in qualsiasi momento.
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Renderizza la griglia con i nomi (usata sia in Piantina che in Manuale)
  funzione renderGridWithNames(getNameForKey, interactive, onCellChange) {
    ritorno (
      <div style={{ display:"flex", flexDirection:"column", gap:8, alignItems:"center", overflowX:"auto", padding:"4px 0" }}>
        {Array.from({ lunghezza: layout.grid.rows }, (_, r) => {
          const hasAnyActive = Array.from({ length: layout.grid.cols }, (_, c) => layout.grid.cells[`${r}_${c}`]).some(Boolean);
          se (!hasAnyActive) {
            // riga vuota = corridoio visivo, piccolo spazio
            restituisci <div key={r} style={{ height:14 }} />;
          }
          ritorno (
            <div key={r} style={{ display:"flex", gap:8 }}>
              {Array.from({ lunghezza: layout.grid.cols }, (_, c) => {
                const key = `${r}_${c}`;
                const active = layout.grid.cells[key];
                se (!attivo) {
                  return <div key={c} style={{ larghezza:74, altezza:58 }} />; // spazio vuoto = corridoio
                }
                const name = getNameForKey(key);
                se (interattivo) {
                  const usedElsewhere = name ? Object.entries(manualMap).some(([k,v]) => v === name && k !== key) : false;
                  ritorno (
                    <seleziona
                      chiave={c}
                      valore={nome || ""}
                      onChange={e => onCellChange(key, e.target.value)}
                      stile={{
                        larghezza:74, altezza:58, raggio del bordo:8, dimensione del carattere:11,
                        bordo: utilizzatoAltrove ? "2px solido #e74c3c" : "1.5px solido #4a6fa5",
                        fontFamily:"Georgia,serif", color:"#2c3e6b",
                        background: name ? "#e8f4fd" : "#f5f5f5", textAlign:"center"
                      }}>
                      <option value="">— vuoto —</option>
                      {students.map(s => <option key={s} value={s}>{s}</option>)}
                    </seleziona>
                  );
                }
                const gi = groupIndexFor(key);
                ritorno (
                  <div key={c} style={{
                    larghezza:74, altezza:58, raggio del bordo:10,
                    background: name ? PASTEL[Math.abs(gi) % PASTEL.length] : "#f0f0f0",
                    bordo: `2px solido ${nome ? "#aaa" : "#ddd"}`,
                    display:"flex", alignItems:"center", justifyContent:"center",
                    padding:4, textAlign:"center"
                  }}>
                    <div style={{ fontSize:12, fontWeight:"bold", color:"#2c3e6b", wordBreak:"break-word" }}>{name || "—"}</div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    );
  }

  ritorno (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #f8f4ef 0%, #eef3f8 100%)",
      fontFamily: "'Georgia', serif",
      padding: "0 0 40px 0"
    }}>
      <style>{`
        @media print { body { background: white !important; } .no-print { display: none !important; } .print-area { box-shadow: none !important; } }
        pulsante { cursore: puntatore; transizione: tutti i 15 secondi; }
        pulsante:hover { opacità: .85; trasformazione: translateY(-1px); }
        input, seleziona { outline: nessuno; }
      `}</style>

      <div style={{
        background: "linear-gradient(90deg, #2c3e6b 0%, #4a6fa5 100%)",
        colore: "#fff", spaziatura interna: "22px 28px 14px", boxShadow: "0 3px 14px #0003"
      }}>
        <div style={{ fontSize: 26, fontWeight: "bold", letterSpacing: 1 }}>🏫 {layout.className}</div>
        <div style={{ fontSize: 13, opacity: .75, marginTop: 4 }}>Gestione posti · rotazione mensile</div>
        <div style={{ fontSize: 10, opacity: .45, marginTop: 6, letterSpacing: 0.5 }}>© Pasquale Zicarelli</div>
      </div>

      <div className="no-print" style={{ display: "flex", gap: 0, background: "#2c3e6b", paddingLeft: 28, flexWrap:"wrap" }}>
        {[["layout","📐 Piantina"],["manual","✏️ Manuale"],["students","👥 Studenti"],["history","📅 Storico"],["dashboard","📊 Dashboard"],["settings","⚙️ Impostazioni"],["help","❓ Guida"]].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{
            background: tab === tasto ? "#f8f4ef" : "trasparente",
            colore: tab === tasto ? "#2c3e6b" : "#aac4e8",
            bordo: "nessuno", spaziatura interna: "10px 18px", fontFamily: "Georgia, serif",
            fontSize: 13, fontWeight: tab === key ? "grassetto" : "normale",
            borderRadius: tab === key ? "8px 8px 0 0" : 0,
          }}>{etichetta}</pulsante>
        ))}
      </div>

      {avviso && (
        <div style={{
          maxWidth: 760, margin: "16px auto 0", padding: "12px 18px",
          background: notice.type === "error" ? "#fdecea" : "#fff8e1",
          colore: notice.type === "errore" ? "#c0392b" : "#856404",
          borderRadius: 10, fontSize: 13, display: "flex",
          justifyContent: "space-between", alignItems: "center", gap: 10
        }}>
          <span>⚠️ {notice.text}</span>
          <button onClick={() => setNotice(null)} style={{
            background: "transparent", border: "none", color: "inherit", fontSize: 16, padding: "0 4px"
          }}>✕</button>
        </div>
      )}

      <div style={{ maxWidth: 820, margin: "0 auto", padding: "24px 16px" }}>

        {tab === "settings" && renderSettings()}

        {/* ── SCHEDA: GUIDA ── */}
        {tab === "aiuto" && (
          <div>
            <div style={{ fontWeight:"bold", color:"#2c3e6b", fontSize:18, marginBottom:6 }}>❓ Come funziona ClassDesk</div>
            <div style={{ color:"#888", fontSize:13, marginBottom:24 }}>Guida rapida per usare l'app al meglio.</div>

            {[
              {
                icon:"⚙️", title:"1. Configura la classe",
                text:"Vai in Impostazioni e dai un nome alla classe. Poi disegna la piantina toccando le celle della griglia: le celle blu sono banchi attivi, quelle grigie sono spazi vuoti (corridoi). Puoi aggiungere o rimuovere righe e colonne con i pulsanti + e −."
              },
              {
                icon:"👥", title:"2. Aggiungi gli studenti",
                text:"Nella scheda Studenti inserire i nomi uno per uno. Spunta la casella 'Mai vicini' per gli studenti che non devono mai vedere affiancati tra loro (es. per dividere un gruppo). Puoi anche impostare per ogni studente una fila fissa (Fila 1, Fila 2, ecc.) dalle Impostazioni."
              },
              {
                icon:"🎲", title:"3. Genera la disposizione",
                text:"Seleziona il mese dal menu nella tab Piantina e clicca Genera disposizione. L'app prova migliaia di combinazioni e sceglie quella che rispetta tutte le regole: nessuna coppia ripetuta rispetto allo storico, rotazione delle file, vincoli personali."
              },
              {
                icona:"✏️", titolo:"4. Inserimento manuale",
                text:"Se preferisci decidere tu la disposizione, vai nella scheda Manuale. Scegli il mese, assegna ogni studente al suo banco tramite i menu a tendina e salva. L'app evidenzia in rosso i duplicati e avvisa se qualcuno non è ancora stato assegnato."
              },
              {
                icona:"🤝", titolo:"5. Regole automatiche",
                text:"L'algoritmo rispetta sempre tre regole: 1) Le coppie adiacenti vengono cambiate ogni mese, confrontando con tutto lo storico. 2) Chi era in prima fila un mese va in una fila diversa il mese dopo. 3) I vincoli personali (mai vicini, sempre vicini, fila fissa) vengono rispettati prima di tutto il resto."
              },
              {
                icon:"📊", title:"6. Dashboard e Storico",
                text:"La Dashboard mostra quante volte ogni coppia di studenti si è seduta vicina, con colori dal verde (1 volta) al rosso (4+). Lo Storico conserva tutte le disposizioni dell'anno. Puoi eliminarle singolarmente o cancellare tutto."
              },
              {
                icon:"📷", title:"7. Salva come immagine",
                text:"Nella scheda Piantina, dopo aver generato la disposizione, clicca Salva immagine per esportare la piantina del mese come file PNG. Puoi stamparla, allegarla al registro o inviarla ai colleghi."
              },
              {
                icona:"🏫", titolo:"8. Più classi",
                text:"Clicca la freccia ← Classi in alto a sinistra per tornare alla schermata principale. Da lì puoi creare e gestire quante classi vuoi — ognuna con la propria piantina, studenti, regole e storico completamente separati."
              },
            ].map((item, i) => (
              <div key={i} style={{ background:"#fff", borderRadius:12, padding:"18px 20px", marginBottom:12, boxShadow:"0 1px 8px #0001", display:"flex", gap:16, alignItems:"flex-start" }}>
                <div style={{ fontSize:28, flexShrink:0, marginTop:2 }}>{item.icon}</div>
                <div>
                  <div style={{ fontWeight:"bold", color:"#2c3e6b", fontSize:15, marginBottom:6 }}>{item.title}</div>
                  <div style={{ fontSize:13, color:"#666", lineHeight:1.6 }}>{item.text}</div>
                </div>
              </div>
            ))}

            <div style={{ background:"#dce8f5", borderRadius:12, padding:"16px 20px", marginTop:8, fontSize:13, color:"#2c3e6b" }}>
              <strong>💡 Consiglio:</strong> i dati vengono salvati automaticamente sul tuo dispositivo — non serve premere nessun pulsante di salvataggio manuale (tranne che per la disposizione manuale). Se si cambia dispositivo o browser, i dati non si trasferiscono automaticamente.
            </div>
          </div>
        )}

        {tab === "layout" && (
          <div>
            <div className="no-print" style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20, flexWrap:"wrap" }}>
              <seleziona
                valore={`${mese}_${anno}`}
                onChange={e => { const [m,y] = e.target.value.split("_").map(Number); setMonth(m); setYear(y); }}
                style={{ padding:"8px 14px", borderRadius:8, border:"1.5px solid #4a6fa5", fontFamily:"Georgia,serif", fontSize:15, background:"#fff", color:"#2c3e6b" }}
              >
                {schoolYear.map(({ mese: m, anno: y }) => (
                  <option key={`${m}_${y}`} value={`${m}_${y}`}>{MONTHS_IT[m]} {y}</option>
                ))}
              </seleziona>
              <button onClick={generate} style={{
                sfondo:"#2c3e6b", colore:"#fff", bordo:"nessuno", raggio del bordo:8,
                padding:"9px 20px", fontFamily:"Georgia,serif", fontSize:14, fontWeight:"bold"
              }}>🎲Genera disposizione</button>
              {assegnazione && <>
                <button onClick={clearMonth} style={{
                  sfondo:"#c0392b", colore:"#fff", bordo:"nessuno", raggio del bordo:8,
                  padding:"9px 16px", fontFamily:"Georgia,serif", fontSize:13
                }}>🗑 Annulla</button>
                <button onClick={exportAsImage} disabled={exporting} style={{
                  sfondo:"#27ae60", colore:"#fff", bordo:"nessuno", raggio del bordo:8,
                  padding:"9px 16px", fontFamily:"Georgia,serif", fontSize:13, opacity: exporting ? 0.6 : 1
                }}>{esportazione ? "⏳ Genero..." : "📷 Salva immagine"}</button>
              </>}
            </div>

            <div style={{ textAlign:"center", fontWeight:"bold", fontSize:18, color:"#2c3e6b", marginBottom:18 }}>
              {MESI_IT[mese]} {anno}
            </div>

            {!assegnazione && (
              <div style={{ textAlign:"center", color:"#888", padding:"40px 0", fontSize:15 }}>
                Nessuna disposizione per questo mese.<br/>Clicca <b>Genera</b> per crearne una!
              </div>
            )}

            {assegnazione && (
              <div ref={piantinaRef} className="print-area" style={{ background:"#fff", borderRadius:14, padding:"24px 20px", boxShadow:"0 4px 24px #0001" }}>
                <div style={{ textAlign:"center", marginBottom:20 }}>
                  <div style={{ display:"inline-block", background:"#2c3e6b", color:"#fff", borderRadius:8, padding:"8px 32px", fontSize:14, letterSpacing:2 }}>CATTEDRA</div>
                </div>

                {renderGridWithNames(key => getSeatStudent(key), false, null)}

                <div style={{ marginTop:24, borderTop:"1px solid #eee", paddingTop:16 }}>
                  <div style={{ fontWeight:"bold", color:"#2c3e6b", marginBottom:10, fontSize:14 }}>🤝 Coppie vicine</div>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                    {assignment.pairs.map((pair, i) => (
                      <div key={i} style={{
                        background: PASTEL[i % PASTEL.length], borderRadius:20, padding:"5px 14px",
                        fontSize:13, color:"#2c3e6b", fontWeight:"bold", border:"1.5px solid #ccc"
                      }}>{pair.join(" & ")}</div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === "manuale" && (
          <div>
            <div style={{ fontWeight:"bold", color:"#2c3e6b", fontSize:17, marginBottom:6 }}>✏️ Manuale di istruzioni — {MONTHS_IT[month]} {year}</div>
            <div style={{ color:"#888", fontSize:13, marginBottom:18 }}>Assegna ogni studente al suo posto.</div>

            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:20, flexWrap:"wrap" }}>
              <seleziona
                valore={`${mese}_${anno}`}
                onChange={e => { const [m,y] = e.target.value.split("_").map(Number); setMonth(m); setYear(y); }}
                style={{ padding:"7px 12px", borderRadius:8, border:"1.5px solid #4a6fa5", fontFamily:"Georgia,serif", fontSize:14, background:"#fff", color:"#2c3e6b" }}
              >
                {schoolYear.map(({ mese: m, anno: y }) => (
                  <option key={`${m}_${y}`} value={`${m}_${y}`}>{MONTHS_IT[m]} {y}</option>
                ))}
              </seleziona>
            </div>

            <div style={{ background:"#fff", borderRadius:14, padding:"20px 16px", boxShadow:"0 2px 12px #0001", marginBottom:20 }}>
              <div style={{ textAlign:"center", marginBottom:18 }}>
                <div style={{ display:"inline-block", background:"#2c3e6b", color:"#fff", borderRadius:8, padding:"7px 28px", fontSize:13, letterSpacing:2 }}>CATTEDRA</div>
              </div>
              {renderGridWithNames(
                chiave => manualMap[chiave] || "",
                VERO,
                (tasto, val) => setManualMap(m => ({ ...m, [tasto]: val }))
              )}
            </div>

            {(() => {
              const assigned = Object.values(manualMap).filter(Boolean);
              const duplicates = assigned.filter((v, i) => assigned.indexOf(v) !== i);
              const missing = students.filter(s => !assigned.includes(s));
              ritorno (
                <div style={{ marginBottom:16 }}>
                  {duplicati.lunghezza > 0 && (
                    <div style={{ background:"#fdecea", borderRadius:8, padding:"8px 14px", marginBottom:8, color:"#c0392b", fontSize:13 }}>
                      ⚠️ Studenti assegnati due volte: {[...new Set(duplicates)].join(", ")}
                    </div>
                  )}
                  {missing.length > 0 && (
                    <div style={{ background:"#fff8e1", borderRadius:8, padding:"8px 14px", color:"#856404", fontSize:13 }}>
                      📋 Non ancora assegnato: {missing.join(", ")}
                    </div>
                  )}
                  {duplicates.length === 0 && missing.length === 0 && students.length > 0 && (
                    <div style={{ background:"#eafaf1", borderRadius:8, padding:"8px 14px", color:"#1e8449", fontSize:13 }}>
                      ✅ Tutti gli studenti sono assegnati correttamente!
                    </div>
                  )}
                </div>
              );
            })()}

            <button onClick={saveManual} style={{
              sfondo:"#2c3e6b", colore:"#fff", bordo:"nessuno", raggio del bordo:8,
              padding:"10px 24px", fontFamily:"Georgia,serif", fontSize:15, fontWeight:"bold"
            }}>💾Salva disposizione</button>
          </div>
        )}

        {tab === "studenti" && (
          <div>
            <div style={{ fontWeight:"bold", color:"#2c3e6b", fontSize:17, marginBottom:6 }}>👥 Elenco studenti ({students.length}/{seats})</div>
            <div style={{ color:"#888", fontSize:13, marginBottom:16 }}>
              Spunta la casella per includere lo studente in un gruppo che non deve mai avere due membri seduti vicini tra loro (es. per dividere maschi e femmine, o un gruppo di amici troppo vivace).
            </div>

            <div style={{ display:"flex", gap:8, marginBottom:16 }}>
              <input
                placeholder="Nome nuovo studente..."
                valore={modificaVal && editingIdx === "nuovo" ? modificaVal : ""}
                onChange={e => { setEditingIdx("new"); setEditVal(e.target.value); }}
                onKeyDown={e => {
                  se (e.key === "Invio" && editVal.trim()) {
                    persistStudents([...studenti, editVal.trim()]);
                    setEditVal(""); setEditingIdx(null);
                  }
                }}
                style={{ flex:1, padding:"8px 12px", borderRadius:8, border:"1.5px solid #4a6fa5", fontFamily:"Georgia,serif", fontSize:14 }}
              />
              <button onClick={() => {
                se (editVal.trim() && editingIdx === "new") {
                  persistStudents([...studenti, editVal.trim()]);
                  setEditVal(""); setEditingIdx(null);
                }
              }} style={{ background:"#27ae60", color:"#fff", border:"none", borderRadius:8, padding:"8px 16px", fontFamily:"Georgia,serif", fontSize:13 }}>+ Aggiungi</button>
            </div>

            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {students.map((name, i) => (
                <div key={i} style={{ display:"flex", alignItems:"center", gap:10, background:"#fff", borderRadius:10, padding:"10px 14px", boxShadow:"0 1px 6px #0001" }}>
                  <div style={{ color:"#aaa", width:22, textAlign:"right", fontSize:13 }}>{i+1}.</div>
                  {editingIdx === i ? (
                    <>
                      <input value={editVal} onChange={e => setEditVal(e.target.value)}
                        onKeyDown={e => { if(e.key==="Enter"){ const a=[...students]; a[i]=editVal; persistStudents(a); setEditingIdx(null); } }}
                        style={{ flex:1, border:"1.5px solid #4a6fa5", borderRadius:6, padding:"5px 10px", fontFamily:"Georgia,serif", fontSize:14 }} autoFocus />
                      <button onClick={() => { const a=[...studenti]; a[i]=modificaValore; persistStudenti(a); setEditingIdx(null); }}
                        style={{ background:"#27ae60", color:"#fff", border:"none", borderRadius:6, padding:"5px 12px", fontSize:13 }}>✓</button>
                      <button onClick={() => setEditingIdx(null)} style={{ background:"#ccc", color:"#555", border:"none", borderRadius:6, padding:"5px 10px", fontSize:13 }}>✕</button>
                    </>
                  ) : (
                    <>
                      <div style={{ flex:1, fontSize:15, color:"#2c3e6b" }}>{nome}</div>
                      <label style={{ display:"flex", alignItems:"center", gap:4, fontSize:12, color:"#4a6fa5", cursor:"pointer" }}>
                        <input
                          tipo="checkbox"
                          controllato={neverAdjacentStudents.includes(name)}
                          onChange={e => {
                            se (e.target.checked) persistNeverAdjacent([...neverAdjacentStudents, name]);
                            altrimenti persistNeverAdjacent(neverAdjacentStudents.filter(m => m !== name));
                          }}
                        /> Mai vicini
                      </label>
                      <button onClick={() => { setEditingIdx(i); setEditVal(name); }}
                        style={{ background:"#4a6fa5", color:"#fff", border:"none", borderRadius:6, padding:"5px 12px", fontSize:13 }}>✏️</button>
                      <button onClick={() => {
                        persistStudents(students.filter((_, idx) => idx !== i));
                        persistNeverAdjacent(neverAdjacentStudents.filter(m => m !== name));
                        const cleanedForbidden = (layout.forbiddenPairs || []).filter(([x, y]) => x !== name && y !== name);
                        const cleanedRequired = (layout.requiredPairs || []).filter(([x, y]) => x !== name && y !== name);
                        const cleanedPositions = { ...(layout.positionConstraints || {}) };
                        elimina le posizioni pulite[nome];
                        persistLayout({ ...layout, forbiddenPairs: cleanedForbidden, requiredPairs: cleanedRequired, positionConstraints: cleanedPositions });
                      }} style={{ background:"transparent", color:"#c0392b", border:"1px solid #c0392b", borderRadius:6, padding:"5px 10px", fontSize:12 }}>🗑</button>
                    </>
                  )}
                </div>
              ))}
              {studenti lunghezza === 0 && (
                <div style={{ color:"#888", textAlign:"center", padding:"30px 0" }}>Nessuno studente ancora. Aggiungine uno sopra!</div>
              )}
            </div>
          </div>
        )}

        {tab === "cronologia" && (
          <div>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16, flexWrap:"wrap", gap:10 }}>
              <div style={{ fontWeight:"bold", color:"#2c3e6b", fontSize:17 }}>📅 Disposizioni storiche</div>
              {historyKeys.length > 0 && (
                confermareEliminaTutto ? (
                  <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                    <span style={{ fontSize:12, color:"#c0392b", fontWeight:"bold" }}>Confermi?</span>
                    <button onClick={clearAllHistory} style={{ background:"#c0392b", color:"#fff", border:"none", borderRadius:8, padding:"7px 14px", fontFamily:"Georgia,serif", fontSize:12 }}>✓ Sì, cancella tutto</button>
                    <button onClick={() => setConfirmDeleteAll(false)} style={{ background:"#ccc", color:"#555", border:"none", borderRadius:8, padding:"7px 14px", fontFamily:"Georgia,serif", fontSize:12 }}>Annulla</button>
                  </div>
                ) : (
                  <button onClick={() => setConfirmDeleteAll(true)} style={{ background:"#c0392b", color:"#fff", border:"none", borderRadius:8, padding:"7px 14px", fontFamily:"Georgia,serif", fontSize:12 }}>🗑 Cancella tutto lo storico</button>
                )
              )}
            </div>
            {historyKeys.length === 0 && (
              <div style={{ color:"#888", textAlign:"center", padding:"40px 0" }}>Nessuna disposizione salvata ancora.</div>
            )}
            {historyKeys.map(key => {
              const [y, m] = key.split("_");
              const entry = history[key];
              ritorno (
                <div key={key} style={{ background:"#fff", borderRadius:12, padding:"14px 18px", marginBottom:12, boxShadow:"0 1px 8px #0001" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
                    <div style={{ fontWeight:"bold", color:"#2c3e6b", fontSize:15 }}>{MONTHS_IT[Number(m)]} {y}</div>
                    {confirmDeleteKey === key ? (
                      <div style={{ display:"flex", gap:6 }}>
                        <button onClick={() => deleteHistoryMonth(key)} style={{ background:"#c0392b", color:"#fff", border:"none", borderRadius:6, padding:"3px 10px", fontSize:11, fontFamily:"Georgia,serif" }}>✓ Conferma</button>
                        <button onClick={() => setConfirmDeleteKey(null)} style={{ background:"#ccc", color:"#555", border:"none", borderRadius:6, padding:"3px 10px", fontSize:11, fontFamily:"Georgia,serif" }}>Annulla</button>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmDeleteKey(key)} style={{ background:"transparent", color:"#c0392b", border:"1px solid #c0392b", borderRadius:6, padding:"3px 10px", fontSize:11, fontFamily:"Georgia,serif" }}>🗑 Elimina</button>
                    )}
                  </div>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                    {entry.pairs.map((pair, i) => (
                      <div key={i} style={{ background: PASTEL[i % PASTEL.length], borderRadius:16, padding:"4px 12px", fontSize:12, color:"#2c3e6b", border:"1px solid #ccc" }}>{pair.join(" & ")}</div>
                    ))}
                  </div>
                  <button onClick={() => { setMonth(Number(m)); setYear(Number(y)); setTab("layout"); }}
                    style={{ marginTop:10, background:"#4a6fa5", color:"#fff", border:"none", borderRadius:6, padding:"5px 14px", fontSize:12, fontFamily:"Georgia,serif" }}>
                    Vedi piantina →
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {tab === "dashboard" && (
          <div>
            <div style={{ fontWeight:"bold", color:"#2c3e6b", fontSize:17, marginBottom:6 }}>📊 Dashboard copia</div>
            <div style={{ color:"#888", fontSize:13, marginBottom:18 }}>Quante volte ogni coppia di studenti si è seduta vicina (banchi adiacenti).</div>

            {(() => {
              const stats = getPairStats();
              se (stats.length === 0) {
                return <div style={{ color:"#888", textAlign:"center", padding:"40px 0" }}>Nessuna disposizione salvata ancora.</div>;
              }
              const maxCount = Math.max(...stats.map(s => s.count));
              ritorno (
                <>
                  <div style={{ background:"#fff", borderRadius:14, boxShadow:"0 2px 12px #0001", overflow:"hidden" }}>
                    {stats.map((s, i) => (
                      <div key={i} style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 16px", background: statColor(s.count), borderBottom: i < stats.length - 1 ? "1px solid #fff" : "none" }}>
                        <div style={{ flex:"0 0 160px", fontWeight:"bold", color:"#2c3e6b", fontSize:13 }}>{sa} + {sb}</div>
                        <div style={{ flex:1, display:"flex", alignItems:"center", gap:8 }}>
                          <div style={{ flex:1, height:10, borderRadius:6, background:"#ffffff80", overflow:"hidden" }}>
                            <div style={{ width: `${(s.count / maxCount) * 100}%`, height:"100%", background:"#2c3e6b", borderRadius:6 }} />
                          </div>
                          <div style={{ fontSize:13, fontWeight:"bold", color:"#2c3e6b", width:28, textAlign:"right" }}>{s.count}×</div>
                        </div>
                        <div style={{ flex:"0 0 110px", fontSize:11, color:"#666", textAlign:"right" }}>{MONTHS_IT[s.lastMonth]} {s.la stYear}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display:"flex", gap:14, marginTop:16, flexWrap:"wrap", fontSize:12, color:"#888" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:5 }}><div style={{ width:12, height:12, borderRadius:3, background:"#E8F5E0" }} /> 1 volta</div>
                    <div style={{ display:"flex", alignItems:"center", gap:5 }}><div style={{ width:12, height:12, borderRadius:3, background:"#FFF9C4" }} /> 2 volte</div>
                    <div style={{ display:"flex", alignItems:"center", gap:5 }}><div style={{ width:12, height:12, borderRadius:3, background:"#FFE8C8" }} /> 3 volte</div>
                    <div style={{ display:"flex", alignItems:"center", gap:5 }}><div style={{ width:12, height:12, borderRadius:3, background:"#FFD6D6" }} /> 4+ volte</div>
                  </div>
                </>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}


// ── COMPONENTE ROOT: selettore classi ──────────────────────
funzione uid() { return Math.random().toString(36).slice(2, 9); }

esporta la funzione predefinita App() {
  const [classi, setClassi] = useState([]); // [{ id, nome, colore, creato in data }]
  const [activeClass, setActiveClass] = useState(null);
  const [newClassName, setNewClassName] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const COLORI = ['#2c3e6b','#27ae60','#e67e22','#8e44ad','#c0392b','#16a085','#d35400','#2980b9'];

  useEffect(() => {
    Tentativo {
      const saved = localStorage.getItem('cd_classes_list');
      se (salvato) impostaClassi(JSON.parse(salvato));
    } presa {}
  }, []);

  funzione salvaClassi(lista) {
    setClasses(list);
    try { localStorage.setItem('cd_classes_list', JSON.stringify(list)); } catch {}
  }

  funzione addClass() {
    const name = newClassName.trim();
    se (!nome) restituisci;
    const color = COLORS[classes.length % COLORS.length];
    const newList = [...classi, { id: uid(), nome, colore, creato in data: Date.now() }];
    salvaClassi(nuovaLista);
    setNewClassName('');
  }

  funzione deleteClass(id) {
    // Rimuovi tutti i dati della classe dal localStorage
    const keys = ['setup_done','layout','students','never_adj','history'];
    keys.forEach(k => { try { localStorage.removeItem(`cd_${id}_${k}`); } catch {} });
    saveClasses(classes.filter(c => c.id !== id));
    setConfirmDeleteId(null);
  }

  funzione rinominaClasse(id, nome) {
    saveClasses(classes.map(c => c.id === id ? { ...c, name } : c));
    setEditingId(null);
  }

  se (activeClass) {
    ritorno (
      <div>
        <div style={{
          background: `linear-gradient(90deg, ${activeClass.color} 0%, ${activeClass.color}cc 100%)`,
          colore: '#fff', spaziatura interna: '12px 20px',
          display: 'flex', alignItems: 'center', gap: 12
        }}>
          <button onClick={() => setActiveClass(null)} style={{
            sfondo: 'rgba(255,255,255,0.2)', bordo: 'nessuno', colore: '#fff',
            bordo: 8, spaziatura interna: '6px 14px', famiglia di caratteri: 'Georgia,serif',
            fontSize: 13, cursor: 'pointer'
          }}>← Classi</button>
          <span style={{ fontWeight: 'bold', fontSize: 16 }}>{activeClass.name}</span>
        </div>
        <ClassRoom classId={activeClass.id} initialName={activeClass.name} onNameChange={name => {
          const updated = classes.map(c => c.id === activeClass.id ? { ...c, name } : c);
          salvaClassi(aggiornato);
          setActiveClass(prev => ({ ...prev, name }));
        }} />
      </div>
    );
  }

  ritorno (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #f8f4ef 0%, #eef3f8 100%)',
      fontFamily: "'Georgia', serif",
      padding: '0 0 40px 0'
    }}>
      <div style={{
        background: 'linear-gradient(90deg, #2c3e6b 0%, #4a6fa5 100%)',
        colore: '#fff', spaziatura interna: '22px 28px 16px',
        boxShadow: '0 3px 14px #0003'
      }}>
        <div style={{ fontSize: 26, fontWeight: 'bold', letterSpacing: 1 }}>🏫 ClassDesk</div>
        <div style={{ fontSize: 13, opacity: .75, marginTop: 4 }}>Le tue classi</div>
        <div style={{ fontSize: 10, opacity: .4, marginTop: 6 }}>© Pasquale Zicarelli</div>
      </div>

      <div style={{ maxWidth: 600, margin: '0 auto', padding: '32px 16px' }}>

        {classes.length === 0 && (
          <div style={{
            textAlign: 'center', color: '#aaa', padding: '48px 0 32px',
            Dimensione carattere: 15
          }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🏫</div>
            Non hai ancora nessuna lezione.<br/>Crea una qui sotto per iniziare!
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 28 }}>
          {classes.map(cls => (
            <div key={cls.id} style={{
              sfondo: '#fff', raggio del bordo: 14,
              boxShadow: '0 2px 10px #0001',
              overflow: 'nascosto',
              bordo: `1px solido #eee`
            }}>
              {editingId === cls.id ? (
                <div style={{ display: 'flex', gap: 8, padding: '14px 16px', alignItems: 'center' }}>
                  <div style={{ width: 10, height: 40, borderRadius: 4, background: cls.color, flexShrink: 0 }} />
                  <input
                    valore={nomeModifica}
                    onChange={e => setEditingName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') renameClass(cls.id, editingName.trim() || cls.name); }}
                    Messa a fuoco automatica
                    style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1.5px solid #4a6fa5',
                      fontFamily: 'Georgia,serif', fontSize: 15 }}
                  />
                  <button onClick={() => renameClass(cls.id, editingName.trim() || cls.name)}
                    stile={{ sfondo: '#27ae60', colore: '#fff', bordo: 'nessuno', raggio del bordo: 8,
                      padding: '8px 14px', fontSize: 13, fontFamily: 'Georgia,serif' }}>✓</button>
                  <button onClick={() => setEditingId(null)}
                    stile={{ sfondo: '#eee', colore: '#666', bordo: 'nessuno', raggio del bordo: 8,
                      padding: '8px 12px', fontSize: 13 }}>✕</button>
                </div>
              ): confirmDeleteId === cls.id ? (
                <div style={{ display: 'flex', gap: 8, padding: '14px 16px', alignItems: 'center', background: '#fdecea' }}>
                  <span style={{ flex: 1, fontSize: 13, color: '#c0392b' }}>
                    Cancellare "{cls.name}" e tutti i suoi dati?
                  </span>
                  <button onClick={() => deleteClass(cls.id)}
                    stile={{ sfondo: '#c0392b', colore: '#fff', bordo: 'nessuno', raggio del bordo: 8,
                      padding: '7px 14px', fontSize: 12, fontFamily: 'Georgia,serif' }}>✓ Sì</button>
                  <button onClick={() => setConfirmDeleteId(null)}
                    stile={{ sfondo: '#eee', colore: '#666', bordo: 'nessuno', raggio del bordo: 8,
                      padding: '7px 12px', fontSize: 12 }}>No</button>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                  <button onClick={() => setActiveClass(cls)} style={{
                    flex: 1, sfondo: 'nessuno', bordo: 'nessuno', cursore: 'puntatore',
                    display: 'flex', alignItems: 'center', gap: 14, padding: '16px',
                    textAlign: 'left'
                  }}>
                    <div style={{ width: 10, height: 48, borderRadius: 4, background: cls.color, flexShrink: 0 }} />
                    <div>
                      <div style={{ fontWeight: 'bold', fontSize: 16, color: '#2c3e6b' }}>{cls.name}</div>
                      <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>
                        Crea il {new Date(cls.createdAt).toLocaleDateString('it-IT')}
                      </div>
                    </div>
                    <div style={{ marginLeft: 'auto', fontSize: 20, opacity: .3, paddingRight: 4 }}>›</div>
                  </button>
                  <div style={{ display: 'flex', gap: 4, padding: '0 12px', borderLeft: '1px solid #f0f0f0' }}>
                    <button onClick={() => { setEditingId(cls.id); setEditingName(cls.name); }}
                      stile={{ sfondo: 'trasparente', bordo: 'nessuno', colore: '#4a6fa5',
                        fontSize: 16, padding: '8px', cursor: 'pointer' }}>✏️</button>
                    <button onClick={() => setConfirmDeleteId(cls.id)}
                      stile={{ sfondo: 'trasparente', bordo: 'nessuno', colore: '#c0392b',
                        fontSize: 16, padding: '8px', cursor: 'pointer' }}>🗑</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        <div style={{
          background: '#fff', borderRadius: 14, padding: '18px 16px',
          boxShadow: '0 2px 10px #0001', border: '1px solid #eee'
        }}>
          <div style={{ fontWeight: 'bold', color: '#2c3e6b', fontSize: 14, marginBottom: 12 }}>
            + Nuova classe
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              valore={nuovoNomeClasse}
              onChange={e => setNewClassName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Invio') addClass(); }}
              placeholder="Nome classe (es. 2D, 3A...)"
              stile={{ flex: 1, padding: '10px 14px', borderRadius: 10,
                bordo: '1.5px solido #4a6fa5', fontFamily: 'Georgia,serif', fontSize: 15 }}
            />
            <button onClick={addClass} style={{
              sfondo: '#2c3e6b', colore: '#fff', bordo: 'nessuno', raggio del bordo: 10,
              padding: '10px 20px', fontFamily: 'Georgia,serif', fontSize: 14, fontWeight: 'bold',
              cursore: 'puntatore'
            }}>Crea</button>
          </div>
        </div>
      </div>
    </div>
  );
}
