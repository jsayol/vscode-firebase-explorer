import {
  $,
  $$,
  enableTailing,
  scrollToBottomIfEnabled
} from '../utils';

interface LogEntry {
  insertId: string;
  textPayload: string | undefined;
  timestamp: string | number | Date;
  labels: {
    execution_id: string;
  };
  severity: string;
}

let isLive = true;
let lastEntry: LogEntry | null = null;
let entriesCounter = 0;

const vscode = acquireVsCodeApi();
const logContainer = $('#logContainer');
const entriesCounterContainer = $('#entriesConter');

window.addEventListener('DOMContentLoaded', () => {
  setupDOMListeners();

  vscode.postMessage({
    command: 'ready'
  });
});

window.addEventListener('message', event => {
  switch (event.data.command) {
    case 'initialize':
      initialize(event.data);
      break;

    case 'fetchNew':
      fetchNew();
      break;

    case 'addEntries':
      addEntries(event.data.entries);
      break;
  }
});

function setupDOMListeners() {
  enableTailing();

  $('#toggleLive').addEventListener('click', toggleLive);

  logContainer.addEventListener('mouseout', () => {
    $$(`#logContainer .activeExec`).forEach(elem => {
      elem.classList.remove('activeExec');
    });
  });

  logContainer.addEventListener('scroll', () => {
    if (isLive && logContainer.dataset.disableTailOnScroll !== 'false') {
      setLiveState(false);
    }
  });
}

function initialize(data: { name: string; isLive: any; entries: any }) {
  logContainer.innerHTML = '';
  $('#functionName').innerText = data.name;
  setLiveState(data.isLive);
  addEntries(data.entries);
  scrollToBottomIfEnabled(logContainer);
}

function fetchNew() {
  vscode.postMessage({
    command: 'getEntries',
    since: !lastEntry
      ? undefined
      : {
          timestamp: lastEntry.timestamp,
          insertId: lastEntry.insertId
        }
  });
  scrollToBottomIfEnabled(logContainer);
}

function addEntries(entries: {
  forEach: (arg0: (entry: any) => void) => void;
}) {
  entries.forEach(addEntry);

  if (isLive) {
    setTimeout(fetchNew, 1000);
    scrollToBottomIfEnabled(logContainer);
  }
}

function addEntry(entry: LogEntry) {
  if (entry.textPayload !== undefined) {
    const date = new Date(entry.timestamp);
    const entryDate = date.toLocaleDateString();
    const lastDate = lastEntry
      ? new Date(lastEntry.timestamp).toLocaleDateString()
      : undefined;

    if (entryDate !== lastDate) {
      const dateHeader = document.createElement('span');
      const dateHeaderInner = document.createElement('div');
      dateHeaderInner.innerText = date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
      dateHeader.appendChild(dateHeaderInner);
      dateHeader.className = 'dateHeader';
      logContainer.appendChild(dateHeader);
    }

    const execId = entry.labels.execution_id;

    const logTime = document.createElement('span');
    logTime.innerText = date.toLocaleTimeString().padStart(11, ' ');
    logTime.className = 'timestamp';
    logTime.title = date.toUTCString();

    const logSeverity = document.createElement('span');
    logSeverity.innerText = entry.severity;
    logSeverity.className = 'severity';

    const logText = document.createElement('span');
    logText.innerText = entry.textPayload;
    logText.className = 'text';

    [logTime, logSeverity, logText].forEach(elem => {
      elem.classList.add(`exec-${execId}`);
      elem.addEventListener('mouseover', hoverSelector(execId));
      logContainer.appendChild(elem);
    });

    incrementEntriescounter();
  }

  lastEntry = entry;
}

function toggleLive() {
  setLiveState(!isLive);
}

function setLiveState(newLiveState: boolean) {
  isLive = newLiveState;

  vscode.postMessage({
    command: 'isLive',
    state: isLive
  });

  if (isLive) {
    document.body.classList.add('isLive');
    scrollToBottomIfEnabled(logContainer);
    vscode.postMessage({
      command: 'getEntries',
      since: !lastEntry
        ? undefined
        : {
            timestamp: lastEntry.timestamp,
            insertId: lastEntry.insertId
          }
    });
  } else {
    document.body.classList.remove('isLive');
  }
}

function injectStyles(rule: {
  trim: () => { replace: (arg0: RegExp, arg1: string) => void };
}) {
  let div = document.createElement('div');
  div.innerHTML = `&shy;<style>${rule.trim().replace(/ +/, ' ')}</style>`;
  document.body.appendChild(div.childNodes[1]);
}

function hoverSelector(execId: any) {
  return () => {
    document
      .querySelectorAll(`#logContainer .activeExec:not(.exec-${execId})`)
      .forEach(elem => {
        elem.classList.remove('activeExec');
      });
    document.querySelectorAll(`#logContainer .exec-${execId}`).forEach(elem => {
      elem.classList.add('activeExec');
    });
  };
}

function incrementEntriescounter() {
  entriesCounter += 1;
  entriesCounterContainer.innerText = String(entriesCounter);
}
