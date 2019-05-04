import {
  PsNodeResult,
  InitializedFunctions,
  ServerStartOptions
} from '../../emulators/utils';
import {
  $,
  $$,
  openTab,
  isSwitchEnabled,
  showDivider,
  scrollToBottomIfEnabled,
  incrementBadgeCounter,
  contains,
  openModal,
  closeModal,
  createDropdownInfoItem,
  createDropdownCheckradioItem,
  createDropdownDivider
} from '../utils';

declare const acquireVsCodeApi: () => {
  postMessage: (msg: any) => void;
  setState: <T>(newState: T) => T;
  getState: () => any;
};

type FunctionMode = 'https' | 'background';

interface State {
  running: boolean;
  funcLogEntries: { https: any[]; background: any[] };
  portBlocking: {
    processInfo?: PsNodeResult | undefined;
    port?: string | undefined;
  };
}

const vscode = acquireVsCodeApi();

const startButton = $('.controls .button.start');
const stopButton = $('.controls .button.stop');
const projectSelector = $<HTMLSelectElement>('.top-controls .project-selector');
const workspaceSelector = $<HTMLSelectElement>(
  '.top-controls .workspace-selector'
);

const state: State = {
  running: false,
  funcLogEntries: {
    https: [],
    background: []
  },
  portBlocking: {}
};

window.addEventListener('DOMContentLoaded', () => {
  setupDOMListeners();

  vscode.postMessage({
    command: 'ready'
  });
});

window.addEventListener('message', ({ data }) => {
  switch (data.command) {
    case 'initialize':
      initialize(data);
      break;
    case 'stdout':
    case 'stderr':
      showCLIOutput(data);
      break;
    case 'log':
      addLogEntry(data.message);
      break;
    case 'stopped':
      stopped();
      break;
    case 'focus':
      // The webview got focus.
      break;
    case 'error':
      // TODO
      console.log(data);
      break;
    case 'emulator-port-taken':
      openTerminateInstanceModal(data);
      break;
    case 'kill-process-result':
      const port = state.portBlocking.port;
      if (port) {
        const shellOutput = $('.tab-content--dashboard .shell-output');
        showDivider(
          shellOutput,
          (data.success ? 'Terminated' : 'Failed to terminate') +
            ' program at port ' +
            port
        );
      }
      state.portBlocking.port = undefined;
      state.portBlocking.processInfo = undefined;
      startButton.removeAttribute('disabled');
      startButton.classList.remove('is-loading');
      if (data.success) {
        start();
      }
      break;
    case 'select-project':
      const optionValue = data.email + '#' + data.projectId;
      const option = [...projectSelector.options].find(
        opt => opt.value === optionValue
      );
      if (option) {
        option.selected = true;
      } else {
        projectSelector.options[0].selected = true;
      }
      break;
    case 'functions':
      processInitializedFunctions(data.functions);
      break;
    default:
      console.error('Unknown command received:', data);
    // TODO: throw? ignore?
  }
});

function setupDOMListeners() {
  $('.tabs.main-navigation').addEventListener('click', openTab);

  $('.tab-content--dashboard .controls .button.start').addEventListener(
    'click',
    start
  );

  $('.tab-content--dashboard .controls .button.stop').addEventListener(
    'click',
    stop
  );

  $('#switch-all-emulators').addEventListener(
    'change',
    toggleAllEmulatorsSwitch
  );

  $<HTMLInputElement>('#switch-emu-functions').addEventListener(
    'change',
    function() {
      const box = $('.tab-content--dashboard .functions-emulator-controls');
      if (this.checked) {
        box.classList.remove('display-none');
      } else {
        box.classList.add('display-none');
      }
    }
  );

  (['https', 'background'] as FunctionMode[]).forEach(mode => {
    $$(
      `.tab-content--${mode}-functions .log-level-selection input.is-checkradio`
    ).forEach(input => {
      input.addEventListener('change', () => applyFunctionsLogLevel(mode));
    });

    $(`.tab-content--${mode}-functions .logging-table`).addEventListener(
      'click',
      functionsTableClick
    );
  });

  $('.modal-prompt-terminate-other-instance .modal-button').addEventListener(
    'click',
    (event: Event) => {
      handleTerminateInstanceModal(event, event.target as HTMLElement);
    }
  );

  $<HTMLSelectElement>(
    '.tab-content--dashboard .workspace-selector-field .workspace-selector'
  ).addEventListener('change', function() {
    const path = this.options[this.selectedIndex].value;
    vscode.postMessage({
      command: 'folder-selected',
      path
    });
  });

  $<HTMLInputElement>('#enable-functions-debug').addEventListener(
    'change',
    function() {
      if (state.running) {
        vscode.postMessage({
          command: 'set-debugging-state',
          enabled: this.checked
        });
      }
    }
  );
}

function setRunningState(running: boolean): void {
  if (running !== state.running) {
    const box = $('.tab-content--dashboard .emulator-selection-controls');
    state.running = running;

    if (running) {
      $$<HTMLInputElement>(box, 'input.switch').forEach(input => {
        input.setAttribute('disabled', 'disabled');
      });
    } else {
      const switchAll = $<HTMLInputElement>(box, '#switch-all-emulators');
      switchAll.removeAttribute('disabled');
      if (!switchAll.checked) {
        $$<HTMLInputElement>(box, 'input[id^="switch-emu-"]').forEach(input => {
          input.removeAttribute('disabled');
        });
      }
    }
  }
}

function start() {
  const selectedProject =
    projectSelector.options[projectSelector.selectedIndex];

  if (!selectedProject || selectedProject.value === '') {
    // TODO: show message telling the user to select a project
    return;
  }

  let emulators: ServerStartOptions['emulators'];

  if (isSwitchEnabled('switch-all-emulators')) {
    emulators = 'all';
  } else {
    const inputs = $$<HTMLInputElement>(
      '.tab-content--dashboard input[id^="switch-emu-"]'
    );

    emulators = [...inputs]
      .filter(input => input.checked)
      .map(input => input.id.match(/switch-emu-(.+)/)![1]);
  }

  const [email, projectId] = selectedProject.value.split('#');
  const options: ServerStartOptions = {
    email,
    projectId,
    emulators,
    folder: workspaceSelector.options[workspaceSelector.selectedIndex].value,
    functionsDebug: isSwitchEnabled('enable-functions-debug'),
    cliDebug: isSwitchEnabled('enable-cli-debug-flag')
  };

  vscode.postMessage({
    command: 'start',
    options
  });

  startButton.setAttribute('disabled', 'disabled');
  stopButton.removeAttribute('disabled');
  document.body.classList.add('running');
  setRunningState(true);
}

function stop() {
  stopButton.classList.add('is-loading');
  stopButton.setAttribute('disabled', 'disabled');
  document.body.classList.remove('running');
  document.body.classList.add('stopping');
  vscode.postMessage({ command: 'stop' });
  setRunningState(false);
}

function stopped() {
  startButton.removeAttribute('disabled');
  stopButton.setAttribute('disabled', 'disabled');
  stopButton.classList.remove('is-loading');
  document.body.classList.remove('running');
  document.body.classList.remove('stopping');
  setRunningState(false);

  const shellOutput = $('.tab-content--dashboard .shell-output');
  showDivider(shellOutput, 'DONE');

  ['firestore', 'database'].forEach(emulator => {
    if (isSwitchEnabled('switch-emu-' + emulator)) {
      const lastElem = $(
        `.tab-content--${emulator} .shell-output div:last-child`
      );
      if (lastElem && !lastElem.classList.contains('is-divider')) {
        const output = $(`.tab-content--${emulator} .shell-output`);
        showDivider(output, 'DONE');
      }
    }
  });
}

function initialize(data: { folders: any; accountsWithProjects: any }) {
  const { folders, accountsWithProjects } = data;

  const numAccounts = accountsWithProjects.length;

  accountsWithProjects.forEach(
    (awp: {
      email: string;
      projects: { forEach: (arg0: (project: any) => void) => void };
    }) => {
      let parent: HTMLSelectElement | HTMLOptGroupElement;

      if (numAccounts > 1) {
        parent = document.createElement('optgroup');
        parent.setAttribute('label', awp.email);
      } else {
        parent = projectSelector;
      }

      awp.projects.forEach(
        (project: { displayName: any; projectId: string }) => {
          const option = document.createElement('option');
          option.innerText = project.displayName || project.projectId;
          option.setAttribute('value', awp.email + '#' + project.projectId);
          parent.appendChild(option);
        }
      );

      if (numAccounts > 1) {
        projectSelector.appendChild(parent);
      }
    }
  );

  folders.forEach((folder: { name: string; path: string }) => {
    const option = document.createElement('option');
    option.innerText = folder.name;
    option.setAttribute('value', folder.path);
    workspaceSelector.appendChild(option);
  });

  setTimeout(() => {
    const event = document.createEvent('HTMLEvents');
    event.initEvent('change', false, true);
    workspaceSelector.dispatchEvent(event);
  }, 0);

  state.funcLogEntries.https = [];
  state.funcLogEntries.background = [];

  startButton.removeAttribute('disabled');

  applyFunctionsLogLevel('https');
  applyFunctionsLogLevel('background');
}

function showCLIOutput(data: { command: string; message: string }) {
  const shellOutput = $('.tab-content--dashboard .shell-output');
  const shellItem = document.createElement('div');
  shellItem.classList.add('item', 'item-' + data.command);
  shellItem.innerHTML = data.message;
  shellOutput.appendChild(shellItem);
  scrollToBottomIfEnabled(shellOutput.closest('.tailing') as HTMLElement);

  const tab = $(`.tabs .tab--dashboard`);
  if (!tab.classList.contains('is-active')) {
    incrementBadgeCounter(tab);
  }
}

function toggleAllEmulatorsSwitch(event: Event) {
  const isChecked = (event.currentTarget as HTMLInputElement).checked;
  ['functions', 'firestore', 'database', 'hosting'].forEach(service => {
    const element = $('#switch-emu-' + service);
    if (element) {
      if (isChecked) {
        element.setAttribute('disabled', 'disabled');
      } else {
        element.removeAttribute('disabled');
      }
    }
  });
}

function addLogEntry(entry: /*TODO*/ {
  module: string;
  mode: string;
  log?: any;
  from?: string;
  data?: any;
}) {
  switch (entry.module) {
    case 'functions':
      addFunctionsLogEntry(entry as any /*TODO*/);
      break;
    case 'firestore':
    case 'database':
      addLogEntryHelper(entry.module, entry as any /*TODO*/);
      break;
    case 'hosting':
      addHostingLogEntry(entry as any /*TODO*/);
      break;
    default:
      console.warn(`Unknown log module "${entry.module}".`, entry);
  }
}

function getIconForLogLevel(level: string, type?: string): string {
  // bug-outline
  // comment-outline
  // comment-alert-outline
  // message-outline
  // message-alert-outline
  // desktop-tower

  switch (level) {
    case 'USER':
      return type === 'function-error' ? 'account-alert' : 'account';
    case 'INFO':
      return 'information';
    case 'ERROR':
      return 'alert';
    case 'DEBUG':
      return 'flag-outline';
    case 'SYSTEM':
      // return 'desktop-tower';
      return 'server';
    default:
      console.warn('Unknown log level: ' + level);
      return 'help-rhombus-outline';
  }
}

function addFunctionsLogEntry(entry: { mode: string; log: any; data?: any }) {
  const { mode: originalMode, log } = entry;

  if (!['HTTPS', 'BACKGROUND'].includes(originalMode)) {
    console.warn(`Unknown mode "${originalMode}" from functions log:`, entry);
    return;
  }

  const logLevel = (log.level || 'unknown').toLowerCase();
  const triggerId = (log.data || {}).triggerId || 'no-triggerId';
  const mode = originalMode.toLowerCase() as FunctionMode;
  const output = $(`.tab-content--${mode}-functions table tbody`);
  const row = document.createElement('tr');

  row.classList.add(
    'log-entry',
    'log-type--' + (log.type || 'unknown').toLowerCase(),
    'log-level--' + logLevel,
    'triggerId--' + triggerId
  );

  const triggerSelection = $<HTMLInputElement>(
    `#function-selection--${mode}-functions input.triggerId--${triggerId}`
  );
  if (!triggerSelection.checked) {
    row.classList.add('unselected');
  }

  row.dataset.logEntryPos = String(state.funcLogEntries[mode].length);
  state.funcLogEntries[mode].push(log);

  ['timestamp', 'level', 'triggerId', /*'type',*/ 'text'].forEach(field => {
    const cell = document.createElement('td');
    cell.classList.add('log-entry-cell', 'log-entry-cell-' + field);

    if (field === 'triggerId') {
      cell.innerText = triggerId;
    } else {
      let value = log[field] || '';

      if (value && field === 'timestamp') {
        const date = new Date(value);
        value = date.toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: 'numeric',
          minute: 'numeric',
          second: 'numeric'
        });
      }

      if (field === 'level') {
        const icon = getIconForLogLevel(log.level, log.type);
        value = `<span class="icon"><i class="mdi mdi-20px mdi-${icon}"></i></span>`;
      }

      cell.innerHTML = value;
    }

    if (field === 'timestamp') {
      cell.classList.add('clickable');
    }

    row.appendChild(cell);
  });

  output.appendChild(row);
  scrollToBottomIfEnabled(output.closest('.tailing') as HTMLElement);

  const levelSelection = $<HTMLInputElement>(
    `#tab-content--${mode}-functions--log-level--${logLevel}`
  );

  if (levelSelection.checked && triggerSelection.checked) {
    const tab = $(`.tabs .tab--${mode}-functions`);
    if (!tab.classList.contains('is-active')) {
      incrementBadgeCounter(tab);
    }
  }
}

function addLogEntryHelper(
  module: 'firestore' | 'database',
  entry: { from: string; line: string }
) {
  const output = $(`.tab-content--${module} .shell-output`);
  const shellItem = document.createElement('div');
  shellItem.classList.add(
    'item',
    'item-' + (entry.from || 'unknown').toLowerCase()
  );
  shellItem.innerHTML = entry.line;
  output.appendChild(shellItem);
  scrollToBottomIfEnabled(output.closest('.tailing') as HTMLElement);

  const tab = $(`.tabs .tab--${module}`);
  if (!tab.classList.contains('is-active')) {
    incrementBadgeCounter(tab);
  }
}

function addHostingLogEntry({ line }: { line: string }) {
  const log = parseHostingLogLine(line);
  if (!log) {
    console.error('Failed to parse a Hosting log entry:', line);
    return;
  }

  const output = $(`.tab-content--hosting table tbody`);
  const row = document.createElement('tr');

  row.classList.add('log-entry');

  (['date', 'ip', 'statusCode', 'method', 'resource'] as Array<
    keyof HostingLogEntry
  >).forEach(field => {
    let value = log[field];
    const cell = document.createElement('td');
    cell.classList.add('log-entry-cell', 'log-entry-cell-' + field);
    cell.setAttribute('title', String(value || ''));

    if (value && field === 'date') {
      value = (value as Date).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric'
      });
    }

    cell.innerText = String(value || '');
    row.appendChild(cell);
  });

  output.appendChild(row);
  scrollToBottomIfEnabled(output.closest('.tailing') as HTMLElement);

  const tab = $(`.tabs .tab--hosting`);
  if (!tab.classList.contains('is-active')) {
    incrementBadgeCounter(tab);
  }
}

function functionsTableClick(event: Event) {
  const target = event.target as HTMLElement;
  const row = target.closest('tr')!;
  const isTimestampCell = target.closest('td.log-entry-cell-timestamp');

  if (isTimestampCell && contains(row.dataset, 'logEntryPos')) {
    const mode = row.closest('table')!.dataset.mode as FunctionMode;
    const logEntryPos = Number(row.dataset.logEntryPos);
    const entry = state.funcLogEntries[mode][logEntryPos];
    openModal('.modal-json-viewer', JSON.stringify(entry, null, 2));
  }
}

function applyFunctionsLogLevel(mode: FunctionMode) {
  const table = $<HTMLTableElement>(`.tab-content--${mode}-functions table`);

  ['user', 'info', 'debug', 'error', 'system'].forEach(level => {
    const checkbox = $<HTMLInputElement>(
      `#tab-content--${mode}-functions--log-level--${level}`
    );

    if (checkbox.checked) {
      table.classList.add('log-level--' + level);
    } else {
      table.classList.remove('log-level--' + level);
    }
  });
}

function openTerminateInstanceModal(data: {
  emulator: any;
  processInfo: PsNodeResult;
}): void {
  let isInstanceOf:
    | 'database'
    | 'firestore'
    | 'functions'
    | 'hosting'
    | undefined;
  let errorMsg = `<h4>Failed to start the <span class="capitalize">${
    data.emulator.name
  }</span> emulator.</h4>`;

  if (data.processInfo) {
    state.portBlocking.processInfo = data.processInfo;
    state.portBlocking.port = data.emulator.addr.port;

    if (isDatabaseEmulatorInstance(data.processInfo)) {
      isInstanceOf = 'database';
    } else if (isFirestoreEmulatorInstance(data.processInfo)) {
      isInstanceOf = 'firestore';
    } else if (isOtherEmulatorInstance(data.processInfo)) {
      isInstanceOf = data.emulator.name;
    }

    if (typeof isInstanceOf === 'string') {
      errorMsg += `
    There's ${
      isInstanceOf === data.emulator.name ? 'another' : 'an'
    } instance of the <span class="capitalize">${isInstanceOf}</span>
    emulator already using port ${state.portBlocking.port}.
    <br/><br/>
    <b>Do you want to terminate it to free the port?</b>
    `;
    } else {
      const { pid, command, arguments: args } = data.processInfo;
      const fullCmd = command + ' ' + args.join(' ');
      errorMsg += `
    <div>The port ${
      state.portBlocking.port
    } is already taken by another program:</div>
    <div><pre><code><b>    PID</b>: ${pid}\n<b>Command</b>: ${fullCmd}</code></pre></div>
    <br/>
    <div><b>Do you want to terminate the other program to free the port?</b></div>
    <br/>
    <div><i><b>Warning:</b> You might lose data if you terminate it unexpectedly.</i></div>
    `;
    }

    openModal('.modal-prompt-terminate-other-instance', {
      isHTML: true,
      content: errorMsg,
      title: 'Warning',
      actionButton:
        'Terminate ' +
        (typeof isInstanceOf === 'string' ? 'instance' : 'program')
    });
  } else {
    const shellOutput = $('.tab-content--dashboard .shell-output');
    showDivider(
      shellOutput,
      'Unknown program is using port ' + data.emulator.addr.port
    );
  }
}

function handleTerminateInstanceModal(
  event: Event,
  modalButton: HTMLElement
): void {
  if (modalButton.dataset.option === 'cancel') {
    state.portBlocking.port = undefined;
    state.portBlocking.processInfo = undefined;
    closeModal(event);
  } else if (modalButton.dataset.option === 'action') {
    if (state.portBlocking.processInfo) {
      startButton.setAttribute('disabled', 'disabled');
      startButton.classList.add('is-loading');

      vscode.postMessage({
        command: 'kill-process',
        pid: state.portBlocking.processInfo.pid
      });
    }
    closeModal(event);
  }
}

function isDatabaseEmulatorInstance(info: PsNodeResult): boolean {
  return (
    info &&
    contains(info, 'arguments') &&
    info.command === 'java' &&
    /firebase-database-emulator(.+)\.jar/.test(info.arguments.join(' '))
  );
}

function isFirestoreEmulatorInstance(info: PsNodeResult): boolean {
  return (
    info &&
    contains(info, 'arguments') &&
    info.command === 'java' &&
    /cloud-firestore-emulator(.+)\.jar/.test(info.arguments.join(' '))
  );
}

function isOtherEmulatorInstance(info: PsNodeResult): boolean {
  return (
    info &&
    contains(info, 'arguments') &&
    info.command === 'node' &&
    /firebase(.+)emulators:start/.test(info.arguments.join(' '))
  );
}

interface HostingLogEntry {
  ip: string;
  date: Date;
  method: string;
  resource: string;
  protocol: string;
  statusCode: number;
  size: number;
  referer: string | null;
  userAgent: string;
}

const hostingLogEntryRegex = /^(\S+) (\S+) (\S+) \[([\w:/]+\s[+\-]\d{4})\] "(\S+)\s?(\S+)?\s?(\S+)?" (\d{3}|-) (\d+|-)\s?"?([^"]*)"?\s?"?([^"]*)?"?\n?$/;
const hostingLogDateRegex = /^(\d+)\/(\w+)\/(\d+):(\d+):(\d+):(\d+) ([\+\-])(\d+)$/;

function parseHostingLogLine(line: string): HostingLogEntry | undefined {
  const match = line.match(hostingLogEntryRegex);
  if (!match) {
    return;
  }

  const d = match[4].match(hostingLogDateRegex);
  if (!d) {
    return;
  }

  const date = new Date(
    `${d[1]} ${d[2]} ${d[3]} ${d[4]}:${d[5]}:${d[6]} GMT${d[7]}${d[8]}`
  );

  return {
    ip: match[1],
    date,
    method: match[5],
    resource: match[6],
    protocol: match[7],
    statusCode: Number(match[8]),
    size: Number(match[9]) || 0,
    referer: match[10] === '-' ? null : match[10],
    userAgent: match[11]
  };
}

function processInitializedFunctions(functions: InitializedFunctions): void {
  const httpsDropdown = $(
    '#function-selection--https-functions .dropdown-content'
  );
  const backgroundDropdown = $(
    '#function-selection--background-functions .dropdown-content'
  );

  // Clear any existing items
  httpsDropdown.innerHTML = '';
  backgroundDropdown.innerHTML = '';

  if (functions.https.length === 0) {
    httpsDropdown.appendChild(
      createDropdownInfoItem('<i>No functions to show</i>')
    );
  } else {
    httpsDropdown.appendChild(
      createDropdownCheckradioItem(
        'tab-content--https-functions--function-all-functions',
        'All functions',
        toggleShowFunction,
        [['mode', 'https'], ['triggerId', 'all-functions']]
      )
    );
    httpsDropdown.appendChild(createDropdownDivider());
    functions.https.forEach(func => {
      httpsDropdown.appendChild(
        createDropdownCheckradioItem(
          `tab-content--https-functions--function-${func.name}`,
          func.name,
          toggleShowFunction,
          [['mode', 'https'], ['triggerId', func.name]]
        )
      );
    });
  }

  // Add more types here when they're integrated with the emulators
  const backgroundTypes = ['firestore'] as (keyof InitializedFunctions)[];
  const childrenToAdd: HTMLElement[] = [];
  let funcsAdded = 0;

  backgroundTypes.forEach(type => {
    const typeFuncs = functions[type];
    if (typeFuncs && typeFuncs.length > 0) {
      childrenToAdd.push(createDropdownDivider());
      typeFuncs.forEach(func => {
        funcsAdded += 1;
        childrenToAdd.push(
          createDropdownCheckradioItem(
            `tab-content--background-functions--function-${func.name}`,
            func.name,
            toggleShowFunction,
            [['mode', 'background'], ['triggerId', func.name]]
          )
        );
      });
    }
  });

  if (funcsAdded === 0) {
    backgroundDropdown.appendChild(
      createDropdownInfoItem('<i>No functions to show</i>')
    );
  } else {
    backgroundDropdown.appendChild(
      createDropdownCheckradioItem(
        'tab-content--background-functions--function-all-functions',
        'All functions',
        toggleShowFunction,
        [['mode', 'background'], ['triggerId', 'all-functions']]
      )
    );
    childrenToAdd.forEach(child => {
      backgroundDropdown.appendChild(child);
    });
  }
}

function toggleShowFunction(event: Event): void {
  const changedInput = event.target as HTMLInputElement;
  const mode = changedInput.dataset.mode;
  const funcName = changedInput.dataset.triggerId;

  if (funcName === 'all-functions') {
    $$<HTMLInputElement>(
      `#function-selection--${mode}-functions .dropdown-item input`
    ).forEach(input => {
      if (input !== changedInput) {
        input.checked = changedInput.checked;
        toggleShowFunction({ target: input } as any);
      }
    });
  } else {
    const table = $<HTMLTableElement>(`.tab-content--${mode}-functions table`);
    const rows = $$(table, 'tbody tr.triggerId--' + funcName);
    if (changedInput.checked) {
      rows.forEach(row => row.classList.remove('unselected'));
    } else {
      rows.forEach(row => row.classList.add('unselected'));
    }
  }
}
