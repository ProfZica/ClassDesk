import { useState, useEffect, useRef } from "react";
import {
  isFirebaseReady, onAuthChange, registerWithEmail, loginWithEmail,
  loginWithGoogle, resetPassword, signOut,
  fetchClassesList, saveClassMeta, deleteClassCloud,
  fetchClassData, saveClassData,
  migrateLocalDataToCloud, hasLocalDataToMigrate
} from "./firebaseStore";

const MONTHS_IT = [
  "Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno",
  "Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"
];

const PASTEL = [
  "#FFD6D6","#FFE8C8","#FFF9C4","#D4F1C4","#C4E8F8","#E0D4F8","#FAD4EF","#FADADD",
  "#D6E8FF","#E8D6FF","#D6FFE8","#FFE8D6"
];

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Griglia di default: 7 righe x 7 colonne, banchi attivi a sinistra e destra
// con un corridoio vuoto centrale (colonna 3), esempio tipico di aula ──
function buildDefaultGrid() {
  const rows = 7, cols = 7;
  const cells = {};
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // riga 0 = davanti (vicino cattedra). Lascia vuota la colonna centrale (corridoio).
      const isCorridor = c === 3;
      const isFrontGap = r === 0; // prima riga vuota = spazio davanti alla cattedra
      cells[`${r}_${c}`] = (!isCorridor && !isFrontGap);
    }
  }
  return { rows, cols, cells };
}

const DEFAULT_LAYOUT = {
  className: "La Mia Classe",
  schoolYearStart: { month: 8, year: new Date().getFullYear() },
  grid: buildDefaultGrid(),
  notes: "",
  forbiddenPairs: [], // coppie di nomi che non devono mai sedere vicine
  requiredPairs: [], // coppie di nomi che devono sempre sedere vicine
  positionConstraints: {}, // { nomeStudente: "row_0" | "row_1" | ... } (indice fila attiva)
};

function buildSchoolYear(start) {
  const months = [];
  let { month, year } = start;
  for (let i = 0; i < 10; i++) {
    months.push({ month, year });
    month++;
    if (month > 11) { month = 0; year++; }
  }
  return months;
}

// Restituisce l'elenco ordinato delle celle ATTIVE (banchi reali), riga per riga
function activeCells(grid) {
  const list = [];
  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.cols; c++) {
      if (grid.cells[`${r}_${c}`]) list.push({ r, c, key: `${r}_${c}` });
    }
  }
  return list;
}

function totalSeats(grid) {
  return activeCells(grid).length;
}

// Coppie ADIACENTI orizzontalmente: due banchi attivi in colonne consecutive,
// nella stessa riga, senza corridoio/vuoto tra loro.
function adjacentPairKeys(grid) {
  const pairs = [];
  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.cols - 1; c++) {
      const k1 = `${r}_${c}`, k2 = `${r}_${c + 1}`;
      if (grid.cells[k1] && grid.cells[k2]) pairs.push([k1, k2]);
    }
  }
  return pairs;
}

// La "prima fila" è la riga attiva più vicina alla cattedra (riga con indice minore tra quelle che hanno almeno un banco)
function frontRowIndex(grid) {
  for (let r = 0; r < grid.rows; r++) {
    for (let c = 0; c < grid.cols; c++) {
      if (grid.cells[`${r}_${c}`]) return r;
    }
  }
  return -1;
}

// Piccolo selettore per aggiungere una coppia di studenti (due menu a tendina + pulsante)
function ForbiddenPairAdder({ students, onAdd, label = "+ Aggiungi", color = "#4a6fa5" }) {
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  return (
    <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
      <select value={a} onChange={e => setA(e.target.value)} style={{
        padding:"6px 10px", borderRadius:8, border:"1.5px solid #4a6fa5", fontFamily:"Georgia,serif", fontSize:13, color:"#2c3e6b"
      }}>
        <option value="">Studente A...</option>
        {students.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
      <span style={{ color:"#aaa" }}>↔</span>
      <select value={b} onChange={e => setB(e.target.value)} style={{
        padding:"6px 10px", borderRadius:8, border:"1.5px solid #4a6fa5", fontFamily:"Georgia,serif", fontSize:13, color:"#2c3e6b"
      }}>
        <option value="">Studente B...</option>

        {students.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
      <button onClick={() => { if (a && b && a !== b) { onAdd(a, b); setA(""); setB(""); } }} style={{
        background:color, color:"#fff", border:"none", borderRadius:8, padding:"6px 14px", fontSize:12, fontFamily:"Georgia,serif"
      }}>{label}</button>
    </div>
  );
}

function ClassRoom({ classId, initialName, onNameChange, cloudUser }) {
  const [setupDone, setSetupDone] = useState(false);
  const [layout, setLayout] = useState(DEFAULT_LAYOUT);
  const [students, setStudents] = useState([]);
  const [neverAdjacentStudents, setNeverAdjacentStudents] = useState([]);
  const [tab, setTab] = useState("layout");
  const [month, setMonth] = useState(DEFAULT_LAYOUT.schoolYearStart.month);
  const [year, setYear] = useState(DEFAULT_LAYOUT.schoolYearStart.year);
  const [history, setHistory] = useState({});
  const [assignment, setAssignment] = useState(null);
  const [manualMap, setManualMap] = useState({});
  const [editingIdx, setEditingIdx] = useState(null);
  const [editVal, setEditVal] = useState("");
  const [confirmDeleteKey, setConfirmDeleteKey] = useState(null);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const [notice, setNotice] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);
  const piantinaRef = useRef(null);

  // Carica i dati della classe: da Firestore se l'utente è loggato, altrimenti da localStorage
  useEffect(() => {
    if (!classId) return;
    let cancelled = false;

    async function loadFromCloud() {
      try {
        const data = await fetchClassData(cloudUser.uid, classId);
        if (cancelled) return;
        if (data) {
          if (data.setupDone) setSetupDone(true);
          if (data.layout) {
            setLayout(data.layout);
            setMonth(data.layout.schoolYearStart.month);
            setYear(data.layout.schoolYearStart.year);
          } else if (initialName) {
            setLayout(prev => ({ ...prev, className: initialName }));
          }
          if (data.students) setStudents(data.students);
          if (data.neverAdjacent) setNeverAdjacentStudents(data.neverAdjacent);
          if (data.history) setHistory(data.history);
        } else if (initialName) {
          setLayout(prev => ({ ...prev, className: initialName }));
        }
      } catch (e) {
        console.error("Errore caricamento dati classe da cloud:", e);
      } finally {
        if (!cancelled) setDataLoaded(true);
      }
    }

    function loadFromLocal() {
      try {
        const savedSetup = localStorage.getItem(`cd_${classId}_setup_done`);
        const savedLayout = localStorage.getItem(`cd_${classId}_layout`);
        const savedStudents = localStorage.getItem(`cd_${classId}_students`);
        const savedMales = localStorage.getItem(`cd_${classId}_never_adj`);
        const savedHistory = localStorage.getItem(`cd_${classId}_history`);

        if (savedSetup === "true") setSetupDone(true);
        if (savedLayout) {
          const parsed = JSON.parse(savedLayout);
          setLayout(parsed);
          setMonth(parsed.schoolYearStart.month);
          setYear(parsed.schoolYearStart.year);
        } else if (initialName) {
          setLayout(prev => ({ ...prev, className: initialName }));
        }
        if (savedStudents) setStudents(JSON.parse(savedStudents));
        if (savedMales) setNeverAdjacentStudents(JSON.parse(savedMales));
        if (savedHistory) setHistory(JSON.parse(savedHistory));
      } catch {}
      setDataLoaded(true);
    }

    if (cloudUser) loadFromCloud();
    else loadFromLocal();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId]);

  useEffect(() => {
    const key = `${year}_${month}`;
    if (history[key]) {
      setAssignment(history[key]);
      setManualMap({ ...history[key].map });
    } else {
      setAssignment(null);
      setManualMap({});
    }
  }, [month, year, history, classId]);

  // Le funzioni persist aggiornano subito lo stato locale (UI reattiva),
  // poi salvano in background su Firestore (se loggato) o localStorage.
  function persistLayout(l) {
    setLayout(l);
    if (cloudUser) {
      saveClassData(cloudUser.uid, classId, { layout: l }).catch(e => console.error(e));
    } else {
      try { localStorage.setItem(`cd_${classId}_layout`, JSON.stringify(l)); } catch {}
    }
  }
  function persistStudents(s) {
    setStudents(s);
    if (cloudUser) {
      saveClassData(cloudUser.uid, classId, { students: s }).catch(e => console.error(e));
    } else {
      try { localStorage.setItem(`cd_${classId}_students`, JSON.stringify(s)); } catch {}
    }
  }
  function persistNeverAdjacent(m) {
    setNeverAdjacentStudents(m);
    if (cloudUser) {
      saveClassData(cloudUser.uid, classId, { neverAdjacent: m }).catch(e => console.error(e));
    } else {
      try { localStorage.setItem(`cd_${classId}_never_adj`, JSON.stringify(m)); } catch {}
    }
  }
  function saveHistory(h) {
    setHistory(h);
    if (cloudUser) {
      saveClassData(cloudUser.uid, classId, { history: h }).catch(e => console.error(e));
    } else {
      try { localStorage.setItem(`cd_${classId}_history`, JSON.stringify(h)); } catch {}
    }
  }
  function completeSetup() {
    setSetupDone(true);
    if (cloudUser) {
      saveClassData(cloudUser.uid, classId, { setupDone: true }).catch(e => console.error(e));
    } else {
      try { localStorage.setItem(`cd_${classId}_setup_done`, "true"); } catch {}
    }
    setMonth(layout.schoolYearStart.month);
    setYear(layout.schoolYearStart.year);
  }

  const schoolYear = buildSchoolYear(layout.schoolYearStart);
  const seats = totalSeats(layout.grid);
  const cellsOrdered = activeCells(layout.grid);

  function buildPairs(map) {
    const pairKeys = adjacentPairKeys(layout.grid);
    const pairs = [];
    pairKeys.forEach(([k1, k2]) => {
      const a = map[k1], b = map[k2];
      if (a && b) pairs.push([a, b].sort());
    });
    return pairs;
  }

  // Controlla sia il gruppo "Mai vicini" (nessuna coppia di studenti dello stesso gruppo adiacente)
  // sia eventuali coppie specifiche vietate definite dal docente nelle Impostazioni
  function checkForbiddenAdjacency(map) {
    const pairKeys = adjacentPairKeys(layout.grid);
    const forbidden = layout.forbiddenPairs || [];
    for (const [k1, k2] of pairKeys) {
      const a = map[k1], b = map[k2];
      if (!a || !b) continue;
      if (neverAdjacentStudents.length > 0 && neverAdjacentStudents.includes(a) && neverAdjacentStudents.includes(b)) return false;
      const isForbidden = forbidden.some(([x, y]) =>
        (x === a && y === b) || (x === b && y === a)
      );
      if (isForbidden) return false;
    }
    return true;
  }

  // Controlla che le coppie "sempre vicine" siano effettivamente adiacenti nella disposizione
  function checkRequiredPairs(map) {
    const required = layout.requiredPairs || [];
    if (required.length === 0) return true;
    const pairKeys = adjacentPairKeys(layout.grid);
    return required.every(([x, y]) => {
      return pairKeys.some(([k1, k2]) => {
        const a = map[k1], b = map[k2];
        return (a === x && b === y) || (a === y && b === x);
      });
    });
  }

  // Controlla i vincoli di posizione: prima fila, ultima fila, o vicino al corridoio
  // Restituisce le righe attive della griglia in ordine (dalla cattedra in poi)
  function activeRows() {
    const rows = new Set();
    for (let r = 0; r < layout.grid.rows; r++) {
      for (let c = 0; c < layout.grid.cols; c++) {
        if (layout.grid.cells[`${r}_${c}`]) rows.add(r);
      }
    }
    return Array.from(rows).sort((a,b) => a-b);
  }

  function checkPositionConstraints(map) {
    const constraints = layout.positionConstraints || {};
    const names = Object.keys(constraints);
    if (names.length === 0) return true;
    const rows = activeRows();

    for (const name of names) {
      const type = constraints[name]; // "row_0", "row_1", ecc.
      if (!students.includes(name)) continue;
      const seatKey = Object.keys(map).find(k => map[k] === name);
      if (!seatKey) continue;
      const [r] = seatKey.split("_").map(Number);
      if (type.startsWith("row_")) {
        const targetRowIdx = Number(type.split("_")[1]); // indice nell'array righe attive
        const targetRow = rows[targetRowIdx];
        if (targetRow === undefined) continue;
        if (r !== targetRow) return false;
      }
    }
    return true;
  }

  function getFrontRowStudents(map) {
    const front = [];
    const fr = frontRowIndex(layout.grid);
    if (fr < 0) return front;
    for (let c = 0; c < layout.grid.cols; c++) {
      const key = `${fr}_${c}`;
      if (layout.grid.cells[key] && map[key]) front.push(map[key]);
    }
    return front;
  }

  function prevMonthKey(y, m) {
    if (m === 0) return `${y - 1}_11`;
    return `${y}_${m - 1}`;
  }

  function checkRowRotation(map, y, m) {
    const prev = history[prevMonthKey(y, m)];
    if (!prev) return true;
    const prevFront = getFrontRowStudents(prev.map);
    if (prevFront.length === 0) return true;
    const newFront = getFrontRowStudents(map);
    return newFront.every(n => !prevFront.includes(n));
  }

  function countRepeatedPairs(map, y, m) {
    const newPairs = buildPairs(map);
    let repeated = 0;
    const currentKey = `${y}_${m}`;
    Object.entries(history).forEach(([key, prev]) => {
      if (key === currentKey) return;
      newPairs.forEach(pair => {
        (prev.pairs || []).forEach(oldPair => {
          if (pair[0] === oldPair[0] && pair[1] === oldPair[1]) repeated++;
        });
      });
    });
    return repeated;
  }

  function countRepeatedPrevMonth(map, y, m) {
    const prev = history[prevMonthKey(y, m)];
    if (!prev) return 0;
    const newPairs = buildPairs(map);
    let repeated = 0;
    newPairs.forEach(pair => {
      (prev.pairs || []).forEach(oldPair => {
        if (pair[0] === oldPair[0] && pair[1] === oldPair[1]) repeated++;
      });
    });
    return repeated;
  }

  // Genera un singolo tentativo di disposizione rispettando, quando possibile,
  // i vincoli di posizione e le coppie "sempre vicine", prima di mescolare il resto.
  function buildAttempt() {
    const keys = cellsOrdered.map(c => c.key);
    const map = {};
    const usedKeys = new Set();
    const usedStudents = new Set();

    const constraints = layout.positionConstraints || {};
    const required = layout.requiredPairs || [];

    const activeRowList = [];
    for (let r = 0; r < layout.grid.rows; r++) {
      for (let c = 0; c < layout.grid.cols; c++) {
        if (layout.grid.cells[`${r}_${c}`]) { activeRowList.push(r); break; }
      }
    }
    const uniqueActiveRows = [...new Set(activeRowList)].sort((a,b)=>a-b);

    function keysForType(type) {
      if (type.startsWith("row_")) {
        const rowIdx = Number(type.split("_")[1]);
        const targetRow = uniqueActiveRows[rowIdx];
        if (targetRow === undefined) return [];
        return keys.filter(k => Number(k.split("_")[0]) === targetRow && !usedKeys.has(k));
      }
      return [];
    }

    // 1) Piazza prima gli studenti con vincolo di posizione (ordine casuale tra loro)
    // Prima i vincoli "aisle" (più difficili da soddisfare perché i posti sono meno),
    // poi front/back, così riduciamo i conflitti tra vincolati
    const constrainedNames = shuffle(Object.keys(constraints).filter(n => students.includes(n)))
;
    constrainedNames.forEach(name => {
      if (usedStudents.has(name)) return;
      // Prima prova solo tra le celle libere del tipo richiesto
      let candidates = shuffle(keysForType(constraints[name]));
      // Se non ce ne sono libere, prova tra tutte le celle del tipo (ignora usedKeys)
      // checkPositionConstraints farà da guardia finale
      if (candidates.length === 0) {
        const allOfType = keys.filter(k => {
          const type = constraints[name];
          if (type.startsWith("row_")) {
            const rowIdx = Number(type.split("_")[1]);
            const targetRow = uniqueActiveRows[rowIdx];
            return Number(k.split("_")[0]) === targetRow;
          }
          return false;
        });
        candidates = shuffle(allOfType);
      }
      if (candidates.length > 0) {
        const key = candidates[0];
        map[key] = name;
        usedKeys.add(key);
        usedStudents.add(name);
      }
    });

    // 2) Piazza le coppie "sempre vicine" sui banchi adiacenti rimasti liberi
    const pairKeysAll = shuffle(adjacentPairKeys(layout.grid));
    shuffle(required).forEach(([x, y]) => {
      if (usedStudents.has(x) || usedStudents.has(y)) return;
      if (!students.includes(x) || !students.includes(y)) return;
      const freePair = pairKeysAll.find(([k1, k2]) => !usedKeys.has(k1) && !usedKeys.has(k2));
      if (freePair) {
        const [k1, k2] = freePair;
        // ordine casuale tra i due studenti nella coppia
        const [first, second] = Math.random() < 0.5 ? [x, y] : [y, x];
        map[k1] = first; map[k2] = second;
        usedKeys.add(k1); usedKeys.add(k2);
        usedStudents.add(x); usedStudents.add(y);
      }
    });

    // 3) Mescola tutti gli studenti rimanenti nei banchi rimanenti
    const remainingStudents = shuffle(students.filter(s => !usedStudents.has(s)));
    const remainingKeys = keys.filter(k => !usedKeys.has(k));
    remainingKeys.forEach((k, idx) => { map[k] = remainingStudents[idx] || ""; });

    return map;
  }

  function tryGenerate(attempts, scoreFn) {
    let best = null, bestScore = Infinity;
    for (let i = 0; i < attempts; i++) {
      const map = buildAttempt();
      if (!checkForbiddenAdjacency(map)) continue;
      if (!checkRequiredPairs(map)) continue;
      if (!checkPositionConstraints(map)) continue;
      if (!checkRowRotation(map, year, month)) continue;
      const score = scoreFn(map);
      if (score < bestScore) {
        bestScore = score;
        best = map;
        if (score === 0) break;
      }
    }
    return { map: best, score: bestScore };
  }

  function generate() {
    if (students.length === 0) {
      setNotice({ type: "error", text: "Aggiungi prima gli studenti nella tab Studenti." });
      return;
    }
    if (seats === 0) {
      setNotice({ type: "error", text: "Nessun banco configurato. Vai in Impostazioni e attiva le celle che rappresentano i banchi." });
      return;
    }
    if (students.length > seats) {
      setNotice({ type: "error", text: `Hai ${students.length} studenti ma solo ${seats} posti disponibili. Aggiungi banchi nelle Impostazioni.` });
      return;
    }

    const fase1 = tryGenerate(3000, m => countRepeatedPairs(m, year, month));
    let finalMap, finalScore, warn = false;

    if (fase1.map && fase1.score === 0) {
      finalMap = fase1.map; finalScore = 0;
    } else {
      const fase2 = tryGenerate(1500, m => countRepeatedPrevMonth(m, year, month));
      if (fase2.map && fase2.score === 0) {
        finalMap = fase2.map;
        finalScore = countRepeatedPairs(finalMap, year, month);
      } else {
        const candidates = [fase1.map, fase2.map].filter(Boolean);
        if (candidates.length === 0) {
          setNotice({ type: "error", text: "Non è stato possibile generare una disposizione valida. Controlla che i vincoli di posizione e le coppie sempre/mai vicine nelle Impostazioni non siano in conflitto tra loro o con il numero di posti disponibili." });
          return;
        }
        finalMap = candidates.reduce((best, m) => {
          const s = countRepeatedPairs(m, year, month);
          return (best === null || s < countRepeatedPairs(best, year, month)) ? m : best;
        }, null);
        finalScore = countRepeatedPairs(finalMap, year, month);
        warn = finalScore > 0;
      }
    }

    const pairs = buildPairs(finalMap);
    const newAssignment = { month, year, map: finalMap, pairs };
    const key = `${year}_${month}`;
    const newHistory = { ...history, [key]: newAssignment };
    saveHistory(newHistory);
    setAssignment(newAssignment);

    if (warn) {
      setNotice({ type: "warning", text: `${finalScore} coppie adiacenti si ripetono rispetto allo storico. Migliorerà nei prossimi mesi.` });
    }
  }

  function clearMonth() {
    const key = `${year}_${month}`;
    const newHistory = { ...history };
    delete newHistory[key];
    saveHistory(newHistory);
    setAssignment(null);
  }

  function deleteHistoryMonth(key) {
    const newHistory = { ...history };
    delete newHistory[key];
    saveHistory(newHistory);
    const [y, m] = key.split("_").map(Number);
    if (y === year && m === month) setAssignment(null);
    setConfirmDeleteKey(null);
  }

  function clearAllHistory() {
    saveHistory({});
    setAssignment(null);
    setConfirmDeleteAll(false);
  }

  function getSeatStudent(key) {
    if (!assignment) return null;
    return assignment.map[key] || null;
  }

  // Colore per "gruppo di banchi contigui" (blocco), non per singola coppia,
  // così un blocco di 3-4 banchi adiacenti ha un colore uniforme
  function groupIndexFor(key) {
    if (!assignment) return -1;
    // Trova il blocco contiguo orizzontale a cui appartiene questa cella
    const [r, c] = key.split("_").map(Number);
    let startC = c;
    while (layout.grid.cells[`${r}_${startC - 1}`]) startC--;
    return r * 100 + startC; // identificatore univoco del blocco, usato come indice colore
  }

  async function exportAsImage() {
    if (!piantinaRef.current) return;
    setExporting(true);
    try {
      if (!window.html2canvas) {
        await new Promise((resolve, reject) => {
          const script = document.createElement("script");
          script.src = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
          script.onload = resolve;
          script.onerror = reject;
          document.body.appendChild(script);
        });
      }
      const canvas = await window.html2canvas(piantinaRef.current, { backgroundColor: "#ffffff", scale: 2 });
      const link = document.createElement("a");
      link.download = `disposizione_${layout.className.replace(/\s+/g, "_")}_${MONTHS_IT[month]}_${year}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch {
      setNotice({ type: "error", text: "Non è stato possibile generare l'immagine. Riprova." });
    } finally {
      setExporting(false);
    }
  }

  function saveManual() {
    const pairs = buildPairs(manualMap);
    const newAssignment = { month, year, map: { ...manualMap }, pairs };
    const key = `${year}_${month}`;
    const newHistory = { ...history, [key]: newAssignment };
    saveHistory(newHistory);
    setAssignment(newAssignment);
    setTab("layout");
  }

  function getPairStats() {
    const counts = {};
    const sortedKeys = Object.keys(history).sort((k1, k2) => {
      const [y1, m1] = k1.split("_").map(Number);
      const [y2, m2] = k2.split("_").map(Number);
      return (y1 * 12 + m1) - (y2 * 12 + m2);
    });
    sortedKeys.forEach(key => {
      const [y, m] = key.split("_").map(Number);
      const entry = history[key];
      (entry.pairs || []).forEach(pair => {
        const sorted = [...pair].sort();
        const k = `${sorted[0]}||${sorted[1]}`;
        if (!counts[k]) counts[k] = { a: sorted[0], b: sorted[1], count: 0, lastMonth: m, lastYear: y };
        counts[k].count++;
        counts[k].lastMonth = m;
        counts[k].lastYear = y;
      });
    });
    return Object.values(counts).sort((x, y) => y.count - x.count);
  }

  function statColor(count) {
    if (count >= 4) return "#FFD6D6";
    if (count === 3) return "#FFE8C8";
    if (count === 2) return "#FFF9C4";
    return "#E8F5E0";
  }

  const historyKeys = Object.keys(history).sort().reverse();

  // ── Editor griglia cliccabile per le Impostazioni ──
  function renderGridEditor() {
    function toggleCell(r, c) {
      const key = `${r}_${c}`;
      const newCells = { ...layout.grid.cells, [key]: !layout.grid.cells[key] };
      persistLayout({ ...layout, grid: { ...layout.grid, cells: newCells } });
    }
    function resizeGrid(dRows, dCols) {
      const newRows = Math.max(1, Math.min(20, layout.grid.rows + dRows));
      const newCols = Math.max(1, Math.min(20, layout.grid.cols + dCols));
      const newCells = {};
      for (let r = 0; r < newRows; r++) {
        for (let c = 0; c < newCols; c++) {
          newCells[`${r}_${c}`] = layout.grid.cells[`${r}_${c}`] || false;
        }
      }
      persistLayout({ ...layout, grid: { rows: newRows, cols: newCols, cells: newCells } });
    }
    function clearGrid() {
      const newCells = {};
      for (let r = 0; r < layout.grid.rows; r++) {
        for (let c = 0; c < layout.grid.cols; c++) newCells[`${r}_${c}`] = false;
      }
      persistLayout({ ...layout, grid: { ...layout.grid, cells: newCells } });
    }
    function fillGrid() {
      const newCells = {};
      for (let r = 0; r < layout.grid.rows; r++) {
        for (let c = 0; c < layout.grid.cols; c++) newCells[`${r}_${c}`] = true;
      }
      persistLayout({ ...layout, grid: { ...layout.grid, cells: newCells } });
    }

    return (
      <div style={{ background:"#fff", borderRadius:12, padding:"16px 18px", marginBottom:16, boxShadow:"0 1px 8px #0001" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6, flexWrap:"wrap", gap:8 }}>
          <label style={{ fontSize:12, color:"#888", fontWeight:"bold" }}>DISPOSIZIONE BANCHI ({seats} posti attivi)</label>
        </div>
        <div style={{ fontSize:12, color:"#aaa", marginBottom:12 }}>
          Tocca una cella per attivarla (banco) o disattivarla (corridoio/vuoto). La cattedra è in alto.
        </div>

        {/* Controlli dimensione griglia */}
        <div style={{ display:"flex", gap:16, marginBottom:14, flexWrap:"wrap" }}>
          <div style={{ display:"flex", alignItems:"center", gap:6 }}>
            <span style={{ fontSize:12, color:"#666" }}>Righe:</span>
            <button onClick={() => resizeGrid(-1, 0)} style={smallBtnStyle}>−</button>
            <span style={{ width:24, textAlign:"center", fontWeight:"bold", color:"#2c3e6b" }}>{layout.grid.rows}</span>
            <button onClick={() => resizeGrid(1, 0)} style={smallBtnStyle}>+</button>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:6 }}>
            <span style={{ fontSize:12, color:"#666" }}>Colonne:</span>
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
          {Array.from({ length: layout.grid.rows }, (_, r) => (
            <div key={r} style={{ display:"flex", gap:4 }}>
              {Array.from({ length: layout.grid.cols }, (_, c) => {
                const active = layout.grid.cells[`${r}_${c}`];
                return (
                  <button
                    key={c}
                    onClick={() => toggleCell(r, c)}
                    style={{
                      width:30, height:30, borderRadius:6,
                      border: active ? "2px solid #4a6fa5" : "1px dashed #ddd",
                      background: active ? "#C4E8F8" : "#fafafa",
                      cursor:"pointer", padding:0,
                      transition:"all .1s"
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
    width:26, height:26, borderRadius:6, border:"1px solid #ccc",
    background:"#f5f5f5", fontSize:14, color:"#2c3e6b"
  };

  function renderSettings() {
    return (
      <div>
        <div style={{ fontWeight:"bold", color:"#2c3e6b", fontSize:18, marginBottom:6 }}>⚙️ Impostazioni classe</div>
        <div style={{ color:"#888", fontSize:13, marginBottom:20 }}>
          Configura nome classe, anno scolastico e disposizione fisica dei banchi.
        </div>

        <div style={{ background:"#fff", borderRadius:12, padding:"16px 18px", marginBottom:16, boxShadow:"0 1px 8px #0001" }}>
          <label style={{ fontSize:12, color:"#888", fontWeight:"bold" }}>NOME CLASSE</label>
          <input
            value={layout.className}
            onChange={e => {
              persistLayout({ ...layout, className: e.target.value });
              if (onNameChange) onNameChange(e.target.value);
            }}
            style={{ width:"100%", marginTop:6, padding:"8px 12px", borderRadius:8,
              border:"1.5px solid #4a6fa5", fontFamily:"Georgia,serif", fontSize:15, color:"#2c3e6b",
              boxSizing:"border-box" }}
          />
        </div>

        <div style={{ background:"#fff", borderRadius:12, padding:"16px 18px", marginBottom:16, boxShadow:"0 1px 8px #0001" }}>
          <label style={{ fontSize:12, color:"#888", fontWeight:"bold" }}>MESE DI INIZIO ANNO SCOLASTICO</label>
          <div style={{ display:"flex", gap:10, marginTop:6 }}>
            <select
              value={layout.schoolYearStart.month}
              onChange={e => persistLayout({ ...layout, schoolYearStart: { ...layout.schoolYearStart, month: Number(e.target.value) } })}
              style={{ flex:1, padding:"8px 12px", borderRadius:8, border:"1.5px solid #4a6fa5", fontFamily:"Georgia,serif", fontSize:14, color:"#2c3e6b" }}
            >
              {MONTHS_IT.map((m,i) => <option key={i} value={i}>{m}</option>)}
            </select>
            <input
              type="number"
              value={layout.schoolYearStart.year}
              onChange={e => persistLayout({ ...layout, schoolYearStart: { ...layout.schoolYearStart, year: Number(e.target.value) } })}
              style={{ width:90, padding:"8px 12px", borderRadius:8, border:"1.5px solid #4a6fa5", fontFamily:"Georgia,serif", fontSize:14, color:"#2c3e6b" }}
            />
          </div>
          <div style={{ fontSize:11, color:"#aaa", marginTop:6 }}>L'app genererà 10 mesi a partire da qui.</div>
        </div>

        {renderGridEditor()}

        {/* Coppie da non sedere mai vicine */}
        <div style={{ background:"#fff", borderRadius:12, padding:"16px 18px", marginBottom:16, boxShadow:"0 1px 8px #0001" }}>
          <label style={{ fontSize:12, color:"#888", fontWeight:"bold" }}>STUDENTI DA NON SEDERE MAI VICINI</label>
          <div style={{ fontSize:12, color:"#aaa", marginTop:4, marginBottom:10 }}>
            Scegli coppie specifiche di studenti che non devono mai essere seduti uno accanto all'altro (es. perché litigano).
          </div>
          {(layout.forbiddenPairs || []).map((pair, i) => (
            <div key={i} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
              <div style={{ flex:1, background:"#fdecea", borderRadius:8, padding:"6px 12px", fontSize:13, color:"#c0392b" }}>
                {pair[0]} ↔ {pair[1]}
              </div>
              <button onClick={() => {
                const newPairs = layout.forbiddenPairs.filter((_, idx) => idx !== i);
                persistLayout({ ...layout, forbiddenPairs: newPairs });
              }} style={{ background:"transparent", color:"#c0392b", border:"1px solid #c0392b", borderRadius:6, padding:"4px 10px", fontSize:12 }}>✕</button>
            </div>
          ))}
          {students.length >= 2 ? (
            <ForbiddenPairAdder students={students} label="+ Aggiungi" color="#c0392b" onAdd={(a, b) => {
              const current = layout.forbiddenPairs || [];
              const exists = current.some(([x,y]) => (x===a&&y===b)||(x===b&&y===a));
              if (!exists && a !== b) {
                persistLayout({ ...layout, forbiddenPairs: [...current, [a, b]] });
              }
            }} />
          ) : (
            <div style={{ fontSize:12, color:"#aaa", fontStyle:"italic" }}>Aggiungi almeno 2 studenti nella tab Studenti per usare questa funzione.</div>
          )}
        </div>

        {/* Coppie da sedere sempre vicine */}
        <div style={{ background:"#fff", borderRadius:12, padding:"16px 18px", marginBottom:16, boxShadow:"0 1px 8px #0001" }}>
          <label style={{ fontSize:12, color:"#888", fontWeight:"bold" }}>STUDENTI DA SEDERE SEMPRE VICINI</label>
          <div style={{ fontSize:12, color:"#aaa", marginTop:4, marginBottom:10 }}>
            Scegli coppie specifiche di studenti che devono sempre essere seduti uno accanto all'altro (es. per supporto didattico).
          </div>
          {(layout.requiredPairs || []).map((pair, i) => (
            <div key={i} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
              <div style={{ flex:1, background:"#eafaf1", borderRadius:8, padding:"6px 12px", fontSize:13, color:"#1e8449" }}>
                {pair[0]} ↔ {pair[1]}
              </div>
              <button onClick={() => {
                const newPairs = layout.requiredPairs.filter((_, idx) => idx !== i);
                persistLayout({ ...layout, requiredPairs: newPairs });
              }} style={{ background:"transparent", color:"#1e8449", border:"1px solid #1e8449", borderRadius:6, padding:"4px 10px", fontSize:12 }}>✕</button>
            </div>
          ))}
          {students.length >= 2 ? (
            <ForbiddenPairAdder students={students} label="+ Aggiungi" color="#27ae60" onAdd={(a, b) => {
              const current = layout.requiredPairs || [];
              const exists = current.some(([x,y]) => (x===a&&y===b)||(x===b&&y===a));
              if (!exists && a !== b) {
                persistLayout({ ...layout, requiredPairs: [...current, [a, b]] });
              }
            }} />
          ) : (
            <div style={{ fontSize:12, color:"#aaa", fontStyle:"italic" }}>Aggiungi almeno 2 studenti nella tab Studenti per usare questa funzione.</div>
          )}
        </div>

        {/* Vincoli di posizione per singolo studente */}
        <div style={{ background:"#fff", borderRadius:12, padding:"16px 18px", marginBottom:16, boxShadow:"0 1px 8px #0001" }}>
          <label style={{ fontSize:12, color:"#888", fontWeight:"bold" }}>POSIZIONE FISSA PER STUDENTE</label>
          <div style={{ fontSize:12, color:"#aaa", marginTop:4, marginBottom:10 }}>
            Vincola uno studente a stare sempre in una fila specifica (es. per esigenze di vista o di attenzione).
          </div>
          {students.length === 0 ? (
            <div style={{ fontSize:12, color:"#aaa", fontStyle:"italic" }}>Aggiungi prima gli studenti nella tab Studenti.</div>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {students.map(name => {
                const current = (layout.positionConstraints || {})[name] || "";
                return (
                  <div key={name} style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <div style={{ flex:1, fontSize:13, color:"#2c3e6b" }}>{name}</div>
                    <select
                      value={current}
                      onChange={e => {
                        const newConstraints = { ...(layout.positionConstraints || {}) };
                        if (e.target.value) newConstraints[name] = e.target.value;
                        else delete newConstraints[name];
                        persistLayout({ ...layout, positionConstraints: newConstraints });
                      }}
                      style={{ padding:"5px 10px", borderRadius:8, border:"1.5px solid #4a6fa5", fontFamily:"Georgia,serif", fontSize:12, color:"#2c3e6b" }}
                    >
                      <option value="">Nessun vincolo</option>
                      {(() => {
                        const rows = [];
                        for (let r = 0; r < layout.grid.rows; r++) {
                          for (let c = 0; c < layout.grid.cols; c++) {
                            if (layout.grid.cells[`${r}_${c}`]) { rows.push(r); break; }
                          }
                        }
                        const unique = [...new Set(rows)].sort((a,b)=>a-b);
                        return unique.map((rowVal, idx) => (
                          <option key={idx} value={`row_${idx}`}>Fila {idx+1}</option>
                        ));
                      })()}
                    </select>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Note libere del docente */}
        <div style={{ background:"#fff", borderRadius:12, padding:"16px 18px", marginBottom:16, boxShadow:"0 1px 8px #0001" }}>
          <label style={{ fontSize:12, color:"#888", fontWeight:"bold" }}>NOTE PERSONALI</label>
          <div style={{ fontSize:12, color:"#aaa", marginTop:4, marginBottom:8 }}>
            Promemoria libero, visibile solo a te. Non influenza la generazione automatica.
          </div>
          <textarea
            value={layout.notes || ""}
            onChange={e => persistLayout({ ...layout, notes: e.target.value })}
            placeholder="Es. Ricordarsi di controllare con la collega di sostegno prima di cambiare Luca..."
            rows={4}
            style={{ width:"100%", padding:"10px 12px", borderRadius:8, border:"1.5px solid #4a6fa5",
              fontFamily:"Georgia,serif", fontSize:14, color:"#2c3e6b", resize:"vertical" }}
          />
        </div>
      </div>
    );
  }

  if (!setupDone) {
    return (
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
              width:"100%", marginTop:10, background:"#2c3e6b", color:"#fff", border:"none",
              borderRadius:10, padding:"12px", fontFamily:"Georgia,serif", fontSize:16, fontWeight:"bold"
            }}>✓ Inizia a usare l'app</button>
            <div style={{ fontSize:11, color:"#aaa", marginTop:10, textAlign:"center" }}>
              Potrai aggiungere gli studenti nella tab successiva, e modificare queste impostazioni in qualsiasi momento.
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Renderizza la griglia con i nomi (usata sia in Piantina che in Manuale)
  function renderGridWithNames(getNameForKey, interactive, onCellChange) {
    return (
      <div style={{ display:"flex", flexDirection:"column", gap:8, alignItems:"center", overflowX:"auto", padding:"4px 0" }}>
        {Array.from({ length: layout.grid.rows }, (_, r) => {
          const hasAnyActive = Array.from({ length: layout.grid.cols }, (_, c) => layout.grid.cells[`${r}_${c}`]).some(Boolean);
          if (!hasAnyActive) {
            // riga vuota = corridoio visivo, piccolo spazio
            return <div key={r} style={{ height:14 }} />;
          }
          return (
            <div key={r} style={{ display:"flex", gap:8 }}>
              {Array.from({ length: layout.grid.cols }, (_, c) => {
                const key = `${r}_${c}`;
                const active = layout.grid.cells[key];
                if (!active) {
                  return <div key={c} style={{ width:74, height:58 }} />; // spazio vuoto = corridoio
                }
                const name = getNameForKey(key);
                if (interactive) {
                  const usedElsewhere = name ? Object.entries(manualMap).some(([k,v]) => v === name && k !== key) : false;
                  return (
                    <select
                      key={c}
                      value={name || ""}
                      onChange={e => onCellChange(key, e.target.value)}
                      style={{
                        width:74, height:58, borderRadius:8, fontSize:11,
                        border: usedElsewhere ? "2px solid #e74c3c" : "1.5px solid #4a6fa5",
                        fontFamily:"Georgia,serif", color:"#2c3e6b",
                        background: name ? "#e8f4fd" : "#f5f5f5", textAlign:"center"
                      }}>
                      <option value="">— vuoto —</option>
                      {students.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  );
                }
                const gi = groupIndexFor(key);
                return (
                  <div key={c} style={{
                    width:74, height:58, borderRadius:10,
                    background: name ? PASTEL[Math.abs(gi) % PASTEL.length] : "#f0f0f0",
                    border: `2px solid ${name ? "#aaa" : "#ddd"}`,
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

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #f8f4ef 0%, #eef3f8 100%)",
      fontFamily: "'Georgia', serif",
      padding: "0 0 40px 0"
    }}>
      <style>{`
        @media print { body { background: white !important; } .no-print { display: none !important; } .print-area { box-shadow: none !important; } }
        button { cursor: pointer; transition: all .15s; }
        button:hover { opacity: .85; transform: translateY(-1px); }
        input, select { outline: none; }
      `}</style>

      <div style={{
        background: "linear-gradient(90deg, #2c3e6b 0%, #4a6fa5 100%)",
        color: "#fff", padding: "22px 28px 14px", boxShadow: "0 3px 14px #0003"
      }}>
        <div style={{ fontSize: 26, fontWeight: "bold", letterSpacing: 1 }}>🏫 {layout.className}</div>
        <div style={{ fontSize: 13, opacity: .75, marginTop: 4 }}>Gestione posti · rotazione mensile</div>
        <div style={{ fontSize: 10, opacity: .45, marginTop: 6, letterSpacing: 0.5 }}>© Pasquale Zicarelli</div>
      </div>

      <div className="no-print" style={{ display: "flex", gap: 0, background: "#2c3e6b", paddingLeft: 28, flexWrap:"wrap" }}>
        {[["layout","📐 Piantina"],["manual","✏️ Manuale"],["students","👥 Studenti"],["history","📅 Storico"],["dashboard","📊 Dashboard"],["settings","⚙️ Impostazioni"],["help","❓ Guida"]].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{
            background: tab === key ? "#f8f4ef" : "transparent",
            color: tab === key ? "#2c3e6b" : "#aac4e8",
            border: "none", padding: "10px 18px", fontFamily: "Georgia, serif",
            fontSize: 13, fontWeight: tab === key ? "bold" : "normal",
            borderRadius: tab === key ? "8px 8px 0 0" : 0,
          }}>{label}</button>
        ))}
      </div>

      {notice && (
        <div style={{
          maxWidth: 760, margin: "16px auto 0", padding: "12px 18px",
          background: notice.type === "error" ? "#fdecea" : "#fff8e1",
          color: notice.type === "error" ? "#c0392b" : "#856404",
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

        {/* ── TAB: GUIDA ── */}
        {tab === "help" && (
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
                text:"Nella tab Studenti inserisci i nomi uno per uno. Spunta la casella 'Mai vicini' per gli studenti che non devono mai sedere affiancati tra loro (es. per dividere un gruppo). Puoi anche impostare per ogni studente una fila fissa (Fila 1, Fila 2, ecc.) dalle Impostazioni."
              },
              {
                icon:"🎲", title:"3. Genera la disposizione",
                text:"Seleziona il mese dal menu nella tab Piantina e clicca Genera disposizione. L'app prova migliaia di combinazioni e sceglie quella che rispetta tutte le regole: nessuna coppia ripetuta rispetto allo storico, rotazione delle file, vincoli personali."
              },
              {
                icon:"✏️", title:"4. Inserimento manuale",
                text:"Se preferisci decidere tu la disposizione, vai nella tab Manuale. Scegli il mese, assegna ogni studente al suo banco tramite i menu a tendina e salva. L'app evidenzia in rosso i duplicati e avvisa se qualcuno non è ancora stato assegnato."
              },
              {
                icon:"🤝", title:"5. Regole automatiche",
                text:"L'algoritmo rispetta sempre tre regole: 1) Le coppie adiacenti vengono cambiate ogni mese, confrontando con tutto lo storico. 2) Chi era in prima fila un mese va in una fila diversa il mese dopo. 3) I vincoli personali (mai vicini, sempre vicini, fila fissa) vengono rispettati prima di tutto il resto."
              },
              {
                icon:"📊", title:"6. Dashboard e Storico",
                text:"La Dashboard mostra quante volte ogni coppia di studenti si è seduta vicina, con colori dal verde (1 volta) al rosso (4+). Lo Storico conserva tutte le disposizioni dell'anno. Puoi eliminarle singolarmente o cancellare tutto."
              },
              {
                icon:"📷", title:"7. Salva come immagine",
                text:"Nella tab Piantina, dopo aver generato la disposizione, clicca Salva immagine per esportare la piantina del mese come file PNG. Puoi stamparla, allegarla al registro o inviarla ai colleghi."
              },
              {
                icon:"🏫", title:"8. Più classi",
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
              <strong>💡 Consiglio:</strong> i dati vengono salvati automaticamente sul tuo dispositivo — non serve premere nessun pulsante di salvataggio manuale (tranne che per la disposizione manuale). Se cambi dispositivo o browser, i dati non si trasferiscono automaticamente.
            </div>
          </div>
        )}

        {tab === "layout" && (
          <div>
            <div className="no-print" style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20, flexWrap:"wrap" }}>
              <select
                value={`${month}_${year}`}
                onChange={e => { const [m,y] = e.target.value.split("_").map(Number); setMonth(m); setYear(y); }}
                style={{ padding:"8px 14px", borderRadius:8, border:"1.5px solid #4a6fa5", fontFamily:"Georgia,serif", fontSize:15, background:"#fff", color:"#2c3e6b" }}
              >
                {schoolYear.map(({ month: m, year: y }) => (
                  <option key={`${m}_${y}`} value={`${m}_${y}`}>{MONTHS_IT[m]} {y}</option>
                ))}
              </select>
              <button onClick={generate} style={{
                background:"#2c3e6b", color:"#fff", border:"none", borderRadius:8,
                padding:"9px 20px", fontFamily:"Georgia,serif", fontSize:14, fontWeight:"bold"
              }}>🎲 Genera disposizione</button>
              {assignment && <>
                <button onClick={clearMonth} style={{
                  background:"#c0392b", color:"#fff", border:"none", borderRadius:8,
                  padding:"9px 16px", fontFamily:"Georgia,serif", fontSize:13
                }}>🗑 Cancella</button>
                <button onClick={exportAsImage} disabled={exporting} style={{
                  background:"#27ae60", color:"#fff", border:"none", borderRadius:8,
                  padding:"9px 16px", fontFamily:"Georgia,serif", fontSize:13, opacity: exporting ? 0.6 : 1
                }}>{exporting ? "⏳ Genero..." : "📷 Salva immagine"}</button>
              </>}
            </div>

            <div style={{ textAlign:"center", fontWeight:"bold", fontSize:18, color:"#2c3e6b", marginBottom:18 }}>
              {MONTHS_IT[month]} {year}
            </div>

            {!assignment && (
              <div style={{ textAlign:"center", color:"#888", padding:"40px 0", fontSize:15 }}>
                Nessuna disposizione per questo mese.<br/>Clicca <b>Genera</b> per crearne una!
              </div>
            )}

            {assignment && (
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

        {tab === "manual" && (
          <div>
            <div style={{ fontWeight:"bold", color:"#2c3e6b", fontSize:17, marginBottom:6 }}>✏️ Inserimento manuale — {MONTHS_IT[month]} {year}</div>
            <div style={{ color:"#888", fontSize:13, marginBottom:18 }}>Assegna tu ogni studente al suo posto.</div>

            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:20, flexWrap:"wrap" }}>
              <select
                value={`${month}_${year}`}
                onChange={e => { const [m,y] = e.target.value.split("_").map(Number); setMonth(m); setYear(y); }}
                style={{ padding:"7px 12px", borderRadius:8, border:"1.5px solid #4a6fa5", fontFamily:"Georgia,serif", fontSize:14, background:"#fff", color:"#2c3e6b" }}
              >
                {schoolYear.map(({ month: m, year: y }) => (
                  <option key={`${m}_${y}`} value={`${m}_${y}`}>{MONTHS_IT[m]} {y}</option>
                ))}
              </select>
            </div>

            <div style={{ background:"#fff", borderRadius:14, padding:"20px 16px", boxShadow:"0 2px 12px #0001", marginBottom:20 }}>
              <div style={{ textAlign:"center", marginBottom:18 }}>
                <div style={{ display:"inline-block", background:"#2c3e6b", color:"#fff", borderRadius:8, padding:"7px 28px", fontSize:13, letterSpacing:2 }}>CATTEDRA</div>
              </div>
              {renderGridWithNames(
                key => manualMap[key] || "",
                true,
                (key, val) => setManualMap(m => ({ ...m, [key]: val }))
              )}
            </div>

            {(() => {
              const assigned = Object.values(manualMap).filter(Boolean);
              const duplicates = assigned.filter((v, i) => assigned.indexOf(v) !== i);
              const missing = students.filter(s => !assigned.includes(s));
              return (
                <div style={{ marginBottom:16 }}>
                  {duplicates.length > 0 && (
                    <div style={{ background:"#fdecea", borderRadius:8, padding:"8px 14px", marginBottom:8, color:"#c0392b", fontSize:13 }}>
                      ⚠️ Studenti assegnati due volte: {[...new Set(duplicates)].join(", ")}
                    </div>
                  )}
                  {missing.length > 0 && (
                    <div style={{ background:"#fff8e1", borderRadius:8, padding:"8px 14px", color:"#856404", fontSize:13 }}>
                      📋 Non ancora assegnati: {missing.join(", ")}
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
              background:"#2c3e6b", color:"#fff", border:"none", borderRadius:8,
              padding:"10px 24px", fontFamily:"Georgia,serif", fontSize:15, fontWeight:"bold"
            }}>💾 Salva disposizione</button>
          </div>
        )}

        {tab === "students" && (
          <div>
            <div style={{ fontWeight:"bold", color:"#2c3e6b", fontSize:17, marginBottom:6 }}>👥 Elenco studenti ({students.length}/{seats})</div>
            <div style={{ color:"#888", fontSize:13, marginBottom:16 }}>
              Spunta la casella per includere lo studente in un gruppo che non deve mai avere due membri seduti vicini tra loro (es. per dividere maschi e femmine, o un gruppo di amici troppo vivace).
            </div>

            <div style={{ display:"flex", gap:8, marginBottom:16 }}>
              <input
                placeholder="Nome nuovo studente..."
                value={editVal && editingIdx === "new" ? editVal : ""}
                onChange={e => { setEditingIdx("new"); setEditVal(e.target.value); }}
                onKeyDown={e => {
                  if (e.key === "Enter" && editVal.trim()) {
                    persistStudents([...students, editVal.trim()]);
                    setEditVal(""); setEditingIdx(null);
                  }
                }}
                style={{ flex:1, padding:"8px 12px", borderRadius:8, border:"1.5px solid #4a6fa5", fontFamily:"Georgia,serif", fontSize:14 }}
              />
              <button onClick={() => {
                if (editVal.trim() && editingIdx === "new") {
                  persistStudents([...students, editVal.trim()]);
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
                      <button onClick={() => { const a=[...students]; a[i]=editVal; persistStudents(a); setEditingIdx(null); }}
                        style={{ background:"#27ae60", color:"#fff", border:"none", borderRadius:6, padding:"5px 12px", fontSize:13 }}>✓</button>
                      <button onClick={() => setEditingIdx(null)} style={{ background:"#ccc", color:"#555", border:"none", borderRadius:6, padding:"5px 10px", fontSize:13 }}>✕</button>
                    </>
                  ) : (
                    <>
                      <div style={{ flex:1, fontSize:15, color:"#2c3e6b" }}>{name}</div>
                      <label style={{ display:"flex", alignItems:"center", gap:4, fontSize:12, color:"#4a6fa5", cursor:"pointer" }}>
                        <input
                          type="checkbox"
                          checked={neverAdjacentStudents.includes(name)}
                          onChange={e => {
                            if (e.target.checked) persistNeverAdjacent([...neverAdjacentStudents, name]);
                            else persistNeverAdjacent(neverAdjacentStudents.filter(m => m !== name));
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
                        delete cleanedPositions[name];
                        persistLayout({ ...layout, forbiddenPairs: cleanedForbidden, requiredPairs: cleanedRequired, positionConstraints: cleanedPositions });
                      }} style={{ background:"transparent", color:"#c0392b", border:"1px solid #c0392b", borderRadius:6, padding:"5px 10px", fontSize:12 }}>🗑</button>
                    </>
                  )}
                </div>
              ))}
              {students.length === 0 && (
                <div style={{ color:"#888", textAlign:"center", padding:"30px 0" }}>Nessuno studente ancora. Aggiungine uno sopra!</div>
              )}
            </div>
          </div>
        )}

        {tab === "history" && (
          <div>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16, flexWrap:"wrap", gap:10 }}>
              <div style={{ fontWeight:"bold", color:"#2c3e6b", fontSize:17 }}>📅 Storico disposizioni</div>
              {historyKeys.length > 0 && (
                confirmDeleteAll ? (
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
              return (
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
            <div style={{ fontWeight:"bold", color:"#2c3e6b", fontSize:17, marginBottom:6 }}>📊 Dashboard coppie</div>
            <div style={{ color:"#888", fontSize:13, marginBottom:18 }}>Quante volte ogni coppia di studenti si è seduta vicina (banchi adiacenti).</div>

            {(() => {
              const stats = getPairStats();
              if (stats.length === 0) {
                return <div style={{ color:"#888", textAlign:"center", padding:"40px 0" }}>Nessuna disposizione salvata ancora.</div>;
              }
              const maxCount = Math.max(...stats.map(s => s.count));
              return (
                <>
                  <div style={{ background:"#fff", borderRadius:14, boxShadow:"0 2px 12px #0001", overflow:"hidden" }}>
                    {stats.map((s, i) => (
                      <div key={i} style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 16px", background: statColor(s.count), borderBottom: i < stats.length - 1 ? "1px solid #fff" : "none" }}>
                        <div style={{ flex:"0 0 160px", fontWeight:"bold", color:"#2c3e6b", fontSize:13 }}>{s.a} + {s.b}</div>
                        <div style={{ flex:1, display:"flex", alignItems:"center", gap:8 }}>
                          <div style={{ flex:1, height:10, borderRadius:6, background:"#ffffff80", overflow:"hidden" }}>
                            <div style={{ width: `${(s.count / maxCount) * 100}%`, height:"100%", background:"#2c3e6b", borderRadius:6 }} />
                          </div>
                          <div style={{ fontSize:13, fontWeight:"bold", color:"#2c3e6b", width:28, textAlign:"right" }}>{s.count}×</div>
                        </div>
                        <div style={{ flex:"0 0 110px", fontSize:11, color:"#666", textAlign:"right" }}>{MONTHS_IT[s.lastMonth]} {s.lastYear}</div>
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


// ── COMPONENTE ROOT: autenticazione + selettore classi ──────
function uid() { return Math.random().toString(36).slice(2, 9); }

// Schermata di login/registrazione
function AuthScreen({ onLoginSuccess }) {
  const [mode, setMode] = useState("login"); // login | register | reset
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(false);

  function friendlyError(err) {
    const code = err?.code || "";
    if (code.includes("email-already-in-use")) return "Esiste già un account con questa email.";
    if (code.includes("invalid-email")) return "Email non valida.";
    if (code.includes("weak-password")) return "La password deve avere almeno 6 caratteri.";
    if (code.includes("user-not-found") || code.includes("wrong-password") || code.includes("invalid-credential")) return "Email o password non corretti.";
    if (code.includes("too-many-requests")) return "Troppi tentativi. Riprova tra qualche minuto.";
    if (code.includes("popup-closed-by-user")) return null; // l'utente ha chiuso il popup, non è un errore
    return "Si è verificato un errore. Riprova.";
  }

  async function handleEmailAuth() {
    setError(null); setInfo(null);
    if (!email || !password) { setError("Inserisci email e password."); return; }
    setLoading(true);
    try {
      if (mode === "login") {
        await loginWithEmail(email, password);
      } else if (mode === "register") {
        await registerWithEmail(email, password);
      }
      onLoginSuccess();
    } catch (err) {
      const msg = friendlyError(err);
      if (msg) setError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setError(null); setInfo(null);
    setLoading(true);
    try {
      await loginWithGoogle();
      onLoginSuccess();
    } catch (err) {
      const msg = friendlyError(err);
      if (msg) setError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleReset() {
    setError(null); setInfo(null);
    if (!email) { setError("Inserisci la tua email per ricevere il link di reset."); return; }
    setLoading(true);
    try {
      await resetPassword(email);
      setInfo("Email inviata! Controlla la posta per reimpostare la password.");
    } catch (err) {
      const msg = friendlyError(err);
      if (msg) setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: "100vh", background: "linear-gradient(135deg, #f8f4ef 0%, #eef3f8 100%)",
      fontFamily: "'Georgia', serif", display: "flex", alignItems: "center", justifyContent: "center",
      padding: "20px"
    }}>
      <div style={{ maxWidth: 380, width: "100%" }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>🏫</div>
          <div style={{ fontSize: 26, fontWeight: "bold", color: "#2c3e6b" }}>ClassDesk</div>
          <div style={{ fontSize: 13, color: "#888", marginTop: 4 }}>
            {mode === "login" && "Accedi al tuo account"}
            {mode === "register" && "Crea un nuovo account"}
            {mode === "reset" && "Recupera la password"}
          </div>
        </div>

        <div style={{ background: "#fff", borderRadius: 16, padding: 24, boxShadow: "0 4px 20px #0001" }}>
          {error && (
            <div style={{ background: "#fdecea", color: "#c0392b", borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: 14 }}>
              {error}
            </div>
          )}
          {info && (
            <div style={{ background: "#eafaf1", color: "#1e8449", borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: 14 }}>
              {info}
            </div>
          )}

          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, color: "#888", fontWeight: "bold" }}>EMAIL</label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="nome@scuola.it"
              style={{ width: "100%", marginTop: 6, padding: "10px 12px", borderRadius: 8,
                border: "1.5px solid #4a6fa5", fontFamily: "Georgia,serif", fontSize: 15,
                color: "#2c3e6b", boxSizing: "border-box" }}
            />
          </div>

          {mode !== "reset" && (
            <div style={{ marginBottom: 18 }}>
              <label style={{ fontSize: 12, color: "#888", fontWeight: "bold" }}>PASSWORD</label>
              <input
                type="password" value={password} onChange={e => setPassword(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleEmailAuth(); }}
                placeholder="••••••••"
                style={{ width: "100%", marginTop: 6, padding: "10px 12px", borderRadius: 8,
                  border: "1.5px solid #4a6fa5", fontFamily: "Georgia,serif", fontSize: 15,
                  color: "#2c3e6b", boxSizing: "border-box" }}
              />
            </div>
          )}

          {mode === "reset" ? (
            <button onClick={handleReset} disabled={loading} style={{
              width: "100%", background: "#2c3e6b", color: "#fff", border: "none",
              borderRadius: 10, padding: "12px", fontFamily: "Georgia,serif", fontSize: 15,
              fontWeight: "bold", opacity: loading ? 0.6 : 1, marginBottom: 10
            }}>{loading ? "Invio..." : "Invia email di recupero"}</button>
          ) : (
            <button onClick={handleEmailAuth} disabled={loading} style={{
              width: "100%", background: "#2c3e6b", color: "#fff", border: "none",
              borderRadius: 10, padding: "12px", fontFamily: "Georgia,serif", fontSize: 15,
              fontWeight: "bold", opacity: loading ? 0.6 : 1, marginBottom: 10
            }}>{loading ? "Attendere..." : (mode === "login" ? "Accedi" : "Registrati")}</button>
          )}

          {mode !== "reset" && (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "14px 0" }}>
                <div style={{ flex: 1, height: 1, background: "#eee" }} />
                <span style={{ fontSize: 11, color: "#aaa" }}>oppure</span>
                <div style={{ flex: 1, height: 1, background: "#eee" }} />
              </div>
              <button onClick={handleGoogle} disabled={loading} style={{
                width: "100%", background: "#fff", color: "#444", border: "1.5px solid #ddd",
                borderRadius: 10, padding: "11px", fontFamily: "Georgia,serif", fontSize: 14,
                fontWeight: "bold", opacity: loading ? 0.6 : 1, display: "flex",
                alignItems: "center", justifyContent: "center", gap: 8
              }}>🔵 Continua con Google</button>
            </>
          )}

          <div style={{ textAlign: "center", marginTop: 18, fontSize: 13 }}>
            {mode === "login" && (
              <>
                <button onClick={() => { setMode("register"); setError(null); setInfo(null); }} style={{
                  background: "none", border: "none", color: "#4a6fa5", cursor: "pointer", fontSize: 13
                }}>Non hai un account? Registrati</button>
                <div style={{ marginTop: 8 }}>
                  <button onClick={() => { setMode("reset"); setError(null); setInfo(null); }} style={{
                    background: "none", border: "none", color: "#888", cursor: "pointer", fontSize: 12
                  }}>Password dimenticata?</button>
                </div>
              </>
            )}
            {mode === "register" && (
              <button onClick={() => { setMode("login"); setError(null); setInfo(null); }} style={{
                background: "none", border: "none", color: "#4a6fa5", cursor: "pointer", fontSize: 13
              }}>Hai già un account? Accedi</button>
            )}
            {mode === "reset" && (
              <button onClick={() => { setMode("login"); setError(null); setInfo(null); }} style={{
                background: "none", border: "none", color: "#4a6fa5", cursor: "pointer", fontSize: 13
              }}>← Torna al login</button>
            )}
          </div>
        </div>

        <div style={{ textAlign: "center", marginTop: 16, fontSize: 11, color: "#aaa" }}>
          I tuoi dati sono protetti e accessibili solo dal tuo account, su qualsiasi dispositivo.
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const firebaseOn = isFirebaseReady();

  const [authChecked, setAuthChecked] = useState(!firebaseOn); // se Firebase non è configurato, salta direttamente
  const [user, setUser] = useState(null);
  const [migrating, setMigrating] = useState(false);
  const [migrationNotice, setMigrationNotice] = useState(null);

  const [classes, setClasses] = useState([]); // [{ id, name, color, createdAt }]
  const [activeClass, setActiveClass] = useState(null);
  const [newClassName, setNewClassName] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editingName, setEditingName] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [loadingClasses, setLoadingClasses] = useState(false);

  const COLORS = ['#2c3e6b','#27ae60','#e67e22','#8e44ad','#c0392b','#16a085','#d35400','#2980b9'];

  // ── Ascolta lo stato di autenticazione ──
  useEffect(() => {
    if (!firebaseOn) return;
    const unsubscribe = onAuthChange(async (u) => {
      setUser(u);
      setAuthChecked(true);
      if (u && hasLocalDataToMigrate()) {
        setMigrating(true);
        const result = await migrateLocalDataToCloud(u.uid);
        setMigrating(false);
        if (result.migrated > 0) {
          setMigrationNotice(`✅ ${result.migrated} classi trovate sul dispositivo sono state caricate nel tuo account.`);
        }
      }
    });
    return unsubscribe;
  }, []);

  // ── Carica elenco classi (da cloud se loggato, da localStorage altrimenti) ──
  useEffect(() => {
    async function loadClasses() {
      if (firebaseOn && user) {
        setLoadingClasses(true);
        try {
          const list = await fetchClassesList(user.uid);
          setClasses(list);
        } catch (e) {
          console.error("Errore caricamento classi da cloud:", e);
        } finally {
          setLoadingClasses(false);
        }
      } else if (!firebaseOn) {
        try {
          const saved = localStorage.getItem('cd_classes_list');
          if (saved) setClasses(JSON.parse(saved));
        } catch {}
      }
    }
    if (authChecked) loadClasses();
  }, [user, authChecked, migrating]);

  async function saveClasses(list) {
    setClasses(list);
    if (firebaseOn && user) {
      // Il salvataggio su Firestore avviene per singola classe (vedi addClass/renameClass)
      return;
    }
    try { localStorage.setItem('cd_classes_list', JSON.stringify(list)); } catch {}
  }

  async function addClass() {
    const name = newClassName.trim();
    if (!name) return;
    const color = COLORS[classes.length % COLORS.length];
    const newClass = { id: uid(), name, color, createdAt: Date.now() };
    const newList = [...classes, newClass];
    setClasses(newList);
    setNewClassName('');

    if (firebaseOn && user) {
      try { await saveClassMeta(user.uid, newClass.id, { name, color, createdAt: newClass.createdAt }); }
      catch (e) { console.error("Errore salvataggio classe su cloud:", e); }
    } else {
      try { localStorage.setItem('cd_classes_list', JSON.stringify(newList)); } catch {}
    }
  }

  async function deleteClass(id) {
    if (firebaseOn && user) {
      try { await deleteClassCloud(user.uid, id); }
      catch (e) { console.error("Errore eliminazione classe da cloud:", e); }
    } else {
      const keys = ['setup_done','layout','students','never_adj','history'];
      keys.forEach(k => { try { localStorage.removeItem(`cd_${id}_${k}`); } catch {} });
    }
    const newList = classes.filter(c => c.id !== id);
    setClasses(newList);
    if (!firebaseOn) { try { localStorage.setItem('cd_classes_list', JSON.stringify(newList)); } catch {} }
    setConfirmDeleteId(null);
  }

  async function renameClass(id, name) {
    const newList = classes.map(c => c.id === id ? { ...c, name } : c);
    setClasses(newList);
    setEditingId(null);
    if (firebaseOn && user) {
      try { await saveClassMeta(user.uid, id, { name }); }
      catch (e) { console.error("Errore rinomina classe su cloud:", e); }
    } else {
      try { localStorage.setItem('cd_classes_list', JSON.stringify(newList)); } catch {}
    }
  }

  async function handleSignOut() {
    await signOut();
    setActiveClass(null);
    setClasses([]);
  }

  // ── Schermata di caricamento iniziale (controllo sessione) ──
  if (firebaseOn && !authChecked) {
    return (
      <div style={{
        minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
        background: "linear-gradient(135deg, #f8f4ef 0%, #eef3f8 100%)", fontFamily: "Georgia,serif"
      }}>
        <div style={{ textAlign: "center", color: "#888" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🏫</div>
          Caricamento...
        </div>
      </div>
    );
  }

  // ── Schermata di login se Firebase è configurato e l'utente non è loggato ──
  if (firebaseOn && !user) {
    return <AuthScreen onLoginSuccess={() => {}} />;
  }

  // ── Schermata di migrazione in corso ──
  if (migrating) {
    return (
      <div style={{
        minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
        background: "linear-gradient(135deg, #f8f4ef 0%, #eef3f8 100%)", fontFamily: "Georgia,serif"
      }}>
        <div style={{ textAlign: "center", color: "#888" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>☁️</div>
          Sincronizzazione dei dati in corso...
        </div>
      </div>
    );
  }

  if (activeClass) {
    return (
      <div>
        <div style={{
          background: `linear-gradient(90deg, ${activeClass.color} 0%, ${activeClass.color}cc 100%)`,
          color: '#fff', padding: '12px 20px',
          display: 'flex', alignItems: 'center', gap: 12
        }}>
          <button onClick={() => setActiveClass(null)} style={{
            background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff',
            borderRadius: 8, padding: '6px 14px', fontFamily: 'Georgia,serif',
            fontSize: 13, cursor: 'pointer'
          }}>← Classi</button>
          <span style={{ fontWeight: 'bold', fontSize: 16 }}>{activeClass.name}</span>
        </div>
        <ClassRoom
          classId={activeClass.id}
          initialName={activeClass.name}
          cloudUser={firebaseOn ? user : null}
          onNameChange={name => {
            const updated = classes.map(c => c.id === activeClass.id ? { ...c, name } : c);
            setClasses(updated);
            setActiveClass(prev => ({ ...prev, name }));
            if (firebaseOn && user) {
              saveClassMeta(user.uid, activeClass.id, { name }).catch(e => console.error(e));
            } else {
              try { localStorage.setItem('cd_classes_list', JSON.stringify(updated)); } catch {}
            }
          }}
        />
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #f8f4ef 0%, #eef3f8 100%)',
      fontFamily: "'Georgia', serif",
      padding: '0 0 40px 0'
    }}>
      <div style={{
        background: 'linear-gradient(90deg, #2c3e6b 0%, #4a6fa5 100%)',
        color: '#fff', padding: '22px 28px 16px',
        boxShadow: '0 3px 14px #0003'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 26, fontWeight: 'bold', letterSpacing: 1 }}>🏫 ClassDesk</div>
            <div style={{ fontSize: 13, opacity: .75, marginTop: 4 }}>Le tue classi</div>
            <div style={{ fontSize: 10, opacity: .4, marginTop: 6 }}>© Pasquale Zicarelli</div>
          </div>
          {firebaseOn && user && (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, opacity: .8 }}>{user.email || "Account Google"}</div>
              <button onClick={handleSignOut} style={{
                marginTop: 6, background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff',
                borderRadius: 6, padding: '4px 10px', fontSize: 11, fontFamily: 'Georgia,serif', cursor: 'pointer'
              }}>Esci</button>
            </div>
          )}
        </div>
      </div>

      {migrationNotice && (
        <div style={{
          maxWidth: 600, margin: '16px auto 0', padding: '12px 18px',
          background: '#eafaf1', color: '#1e8449', borderRadius: 10, fontSize: 13,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10
        }}>
          <span>{migrationNotice}</span>
          <button onClick={() => setMigrationNotice(null)} style={{
            background: 'transparent', border: 'none', color: 'inherit', fontSize: 16, padding: '0 4px', cursor: 'pointer'
          }}>✕</button>
        </div>
      )}

      <div style={{ maxWidth: 600, margin: '0 auto', padding: '32px 16px' }}>

        {loadingClasses && (
          <div style={{ textAlign: 'center', color: '#aaa', padding: '24px 0' }}>Caricamento classi...</div>
        )}

        {!loadingClasses && classes.length === 0 && (
          <div style={{
            textAlign: 'center', color: '#aaa', padding: '48px 0 32px',
            fontSize: 15
          }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>🏫</div>
            Non hai ancora nessuna classe.<br/>Creane una qui sotto per iniziare!
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 28 }}>
          {classes.map(cls => (
            <div key={cls.id} style={{
              background: '#fff', borderRadius: 14,
              boxShadow: '0 2px 10px #0001',
              overflow: 'hidden',
              border: `1px solid #eee`
            }}>
              {editingId === cls.id ? (
                <div style={{ display: 'flex', gap: 8, padding: '14px 16px', alignItems: 'center' }}>
                  <div style={{ width: 10, height: 40, borderRadius: 4, background: cls.color, flexShrink: 0 }} />
                  <input
                    value={editingName}
                    onChange={e => setEditingName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') renameClass(cls.id, editingName.trim() || cls.name); }}
                    autoFocus
                    style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1.5px solid #4a6fa5',
                      fontFamily: 'Georgia,serif', fontSize: 15, boxSizing: 'border-box' }}
                  />
                  <button onClick={() => renameClass(cls.id, editingName.trim() || cls.name)}
                    style={{ background: '#27ae60', color: '#fff', border: 'none', borderRadius: 8,
                      padding: '8px 14px', fontSize: 13, fontFamily: 'Georgia,serif' }}>✓</button>
                  <button onClick={() => setEditingId(null)}
                    style={{ background: '#eee', color: '#666', border: 'none', borderRadius: 8,
                      padding: '8px 12px', fontSize: 13 }}>✕</button>
                </div>
              ) : confirmDeleteId === cls.id ? (
                <div style={{ display: 'flex', gap: 8, padding: '14px 16px', alignItems: 'center', background: '#fdecea' }}>
                  <span style={{ flex: 1, fontSize: 13, color: '#c0392b' }}>
                    Cancellare "{cls.name}" e tutti i suoi dati?
                  </span>
                  <button onClick={() => deleteClass(cls.id)}
                    style={{ background: '#c0392b', color: '#fff', border: 'none', borderRadius: 8,
                      padding: '7px 14px', fontSize: 12, fontFamily: 'Georgia,serif' }}>✓ Sì</button>
                  <button onClick={() => setConfirmDeleteId(null)}
                    style={{ background: '#eee', color: '#666', border: 'none', borderRadius: 8,
                      padding: '7px 12px', fontSize: 12 }}>No</button>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                  <button onClick={() => setActiveClass(cls)} style={{
                    flex: 1, background: 'none', border: 'none', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 14, padding: '16px',
                    textAlign: 'left'
                  }}>
                    <div style={{ width: 10, height: 48, borderRadius: 4, background: cls.color, flexShrink: 0 }} />
                    <div>
                      <div style={{ fontWeight: 'bold', fontSize: 16, color: '#2c3e6b' }}>{cls.name}</div>
                      <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>
                        Creata il {new Date(cls.createdAt).toLocaleDateString('it-IT')}
                      </div>
                    </div>
                    <div style={{ marginLeft: 'auto', fontSize: 20, opacity: .3, paddingRight: 4 }}>›</div>
                  </button>
                  <div style={{ display: 'flex', gap: 4, padding: '0 12px', borderLeft: '1px solid #f0f0f0' }}>
                    <button onClick={() => { setEditingId(cls.id); setEditingName(cls.name); }}
                      style={{ background: 'transparent', border: 'none', color: '#4a6fa5',
                        fontSize: 16, padding: '8px', cursor: 'pointer' }}>✏️</button>
                    <button onClick={() => setConfirmDeleteId(cls.id)}
                      style={{ background: 'transparent', border: 'none', color: '#c0392b',
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
              value={newClassName}
              onChange={e => setNewClassName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addClass(); }}
              placeholder="Nome classe (es. 2D, 3A...)"
              style={{ flex: 1, padding: '10px 14px', borderRadius: 10,
                border: '1.5px solid #4a6fa5', fontFamily: 'Georgia,serif', fontSize: 15, boxSizing: 'border-box' }}
            />
            <button onClick={addClass} style={{
              background: '#2c3e6b', color: '#fff', border: 'none', borderRadius: 10,
              padding: '10px 20px', fontFamily: 'Georgia,serif', fontSize: 14, fontWeight: 'bold',
              cursor: 'pointer'
            }}>Crea</button>
          </div>
        </div>

        {!firebaseOn && (
          <div style={{ marginTop: 20, fontSize: 12, color: '#aaa', textAlign: 'center', lineHeight: 1.6 }}>
            ☁️ Sincronizzazione cloud non configurata.<br/>I dati restano salvati solo su questo dispositivo.
          </div>
        )}
      </div>
    </div>
  );
}
