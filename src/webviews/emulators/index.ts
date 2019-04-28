declare const acquireVsCodeApi: () => {
  postMessage: (msg: any) => void;
  setState: <T>(newState: T) => T;
  getState: () => any;
};

interface ProcessInfo {
  command?: string;
  invokingCommand?: string;
  pid?: string;
  port?: string;
}

const vscode = acquireVsCodeApi();

const startButton = getElement('.controls .button.start');
const stopButton = getElement('.controls .button.stop');

const projectSelector = getElement<HTMLSelectElement>(
  '.top-controls .project-selector'
);

const workspaceSelector = getElement('.top-controls .workspace-selector');

let logEntries: any[] = [];

let portBlockingProcessInfo: ProcessInfo | undefined;

setupDOMListeners();

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
      if (portBlockingProcessInfo) {
        const shellOutput = getElement('.tab-content--dashboard .shell-output');
        showDivider(
          shellOutput,
          (data.success ? 'Terminated' : 'Failed to terminate') +
            ' program at port ' +
            portBlockingProcessInfo.port
        );
        portBlockingProcessInfo = undefined;
      }
      if (data.success) {
        start();
      }
      break;
    default:
      console.error('Unknown command received:', data);
    // TODO: throw? ignore?
  }
});

vscode.postMessage({
  command: 'ready'
});

window.addEventListener('DOMContentLoaded', () => {
  getElement('.tabs.main-navigation').addEventListener('click', openTab);
});

function setupDOMListeners() {
  getElement(
    '.tab-content--dashboard .controls .button.start'
  ).addEventListener('click', start);

  getElement('.tab-content--dashboard .controls .button.stop').addEventListener(
    'click',
    stop
  );

  getElement('#switch-emu-all').addEventListener(
    'change',
    toggleAllEmulatorsSwitch
  );

  getElements(
    '.tab-content--https-functions .log-level-selection input.is-checkradio'
  ).forEach(input => {
    input.addEventListener('change', applyHttpsFuncLogLevel);
  });

  getElement('.tab-content--https-functions .logging-table').addEventListener(
    'click',
    tableClick
  );

  document.body.addEventListener('click', (event: Event) => {
    const target = event.target as HTMLElement;
    if (
      target.closest('.modal .modal-background') ||
      target.closest('.modal .delete')
    ) {
      closeModal(event);
      return;
    }

    const modalButton = target.closest(
      '.modal-prompt-terminate-other-instance .modal-button'
    ) as HTMLElement;
    if (modalButton) {
      handleTerminateInstanceModal(event, modalButton);
      return;
    }
  });

  getElements('.tailing').forEach(element => {
    element.addEventListener('scroll', () => {
      const dataset = element.dataset;

      if (dataset.disableTailOnScroll !== 'false') {
        const distanceFromBottom =
          element.scrollHeight - element.scrollTop - element.offsetHeight;
        dataset.tailEnabled = distanceFromBottom <= 15 ? 'true' : 'false';
      } else {
        dataset.disableTailOnScroll = 'true';
      }
    });
  });
}

function start() {
  // @ts-ignore
  const [email, projectId] = projectSelector.options[
    projectSelector.selectedIndex
  ].value.split('#');
  // @ts-ignore
  const path = workspaceSelector.options[workspaceSelector.selectedIndex].value;

  let emulators;
  const allEmulators = isSwitchEnabled('switch-emu-all');
  if (allEmulators) {
    emulators = 'all';
  } else {
    emulators = [];
    if (isSwitchEnabled('switch-emu-functions')) {
      emulators.push('functions');
    }
    if (isSwitchEnabled('switch-emu-firestore')) {
      emulators.push('firestore');
    }
    if (isSwitchEnabled('switch-emu-database')) {
      emulators.push('database');
    }
  }

  vscode.postMessage({ command: 'start', email, projectId, path, emulators });
  startButton.setAttribute('disabled', 'disabled');
  stopButton.removeAttribute('disabled');
  document.body.classList.add('running');
}

function stop() {
  stopButton.classList.add('is-loading');
  stopButton.setAttribute('disabled', 'disabled');
  document.body.classList.remove('running');
  document.body.classList.add('stopping');
  vscode.postMessage({ command: 'stop' });
}

function stopped() {
  startButton.removeAttribute('disabled');
  stopButton.setAttribute('disabled', 'disabled');
  stopButton.classList.remove('is-loading');
  document.body.classList.remove('running');
  document.body.classList.remove('stopping');

  const shellOutput = getElement('.tab-content--dashboard .shell-output');
  showDivider(shellOutput, 'DONE');
}

function initialize(data: {
  folders: any;
  accountsWithProjects: any;
  selectedAccountEmail: any;
  selectedProjectId: any;
}) {
  const {
    folders,
    accountsWithProjects,
    selectedAccountEmail,
    selectedProjectId
  } = data;

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

          const isSelected =
            selectedAccountEmail === awp.email &&
            selectedProjectId === project.projectId;

          if (isSelected) {
            option.setAttribute('selected', 'selected');
          }

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

  if (folders.length > 1) {
    const field = getElement('.top-controls .workspace-selector-field');
    field.classList.remove('hidden');
  }

  logEntries = [];

  startButton.removeAttribute('disabled');
  applyHttpsFuncLogLevel();
}

function showCLIOutput(data: { command: string; message: string }) {
  const shellOutput = getElement('.tab-content--dashboard .shell-output');

  const shellItem = document.createElement('div');
  shellItem.classList.add('item', 'item-' + data.command);
  shellItem.innerHTML = data.message;
  shellOutput.appendChild(shellItem);
  scrollToBottomIfEnabled(shellOutput.closest('.tailing') as HTMLElement);
}

function isSwitchEnabled(id: string) {
  const elem = getElement<HTMLInputElement>('#' + id);
  return elem.checked;
}

function toggleAllEmulatorsSwitch(event: Event) {
  const isChecked = (event.currentTarget as HTMLInputElement).checked;
  ['functions', 'firestore', 'database'].forEach(service => {
    const element = getElement('#switch-emu-' + service);
    if (element) {
      if (isChecked) {
        element.setAttribute('disabled', 'disabled');
      } else {
        element.removeAttribute('disabled');
      }
    }
  });
}

function openTab(event: Event) {
  const tab = (event.target as Element).closest('li');

  if (tab) {
    const tabName = tab.dataset.tabname;

    const tabs = getElements('.tabs li');
    tabs.forEach(tab => {
      const isSelected = tab.classList.contains('tab--' + tabName);
      if (isSelected) {
        tab.classList.add('is-active');
      } else {
        tab.classList.remove('is-active');
      }
    });

    const contents = getElements('.tab-content');
    contents.forEach(tabContent => {
      const isSelected = tabContent.classList.contains(
        'tab-content--' + tabName
      );
      if (isSelected) {
        tabContent.classList.add('is-active');
        getElements(tabContent, '.tailing').forEach(element => {
          scrollToBottomIfEnabled(element);
        });
      } else {
        tabContent.classList.remove('is-active');
      }
    });
  }
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
      addFirestoreLogEntry(entry as any /*TODO*/);
      break;
    case 'database':
      addDatabaseLogEntry(entry as any /*TODO*/);
      break;
    default:
      console.warn(`Unknown log module "${entry.module}".`, entry);
  }
}

function addFunctionsLogEntry(entry: { mode: string; log: any }) {
  const { mode, log } = entry;
  let functionType: string;

  if (mode === 'HTTPS') {
    functionType = 'https';
  } else if (mode === 'BACKGROUND') {
    functionType = 'callable';
  } else {
    console.warn(`Unknown mode "${mode}" from functions log:`, entry);
    return;
  }

  const output = getElement(
    `.tab-content--${functionType}-functions table tbody`
  );
  const row = document.createElement('tr');

  row.classList.add(
    'log-entry',
    'log-type--' + (log.type || 'unknown').toLowerCase(),
    'log-level--' + (log.level || 'unknown').toLowerCase()
  );

  row.dataset.logEntryPos = String(logEntries.length);
  logEntries.push(log);

  ['timestamp', 'type', 'level', 'text'].forEach(field => {
    let value = log[field] || '';
    const cell = document.createElement('td');
    cell.classList.add('log-entry-cell', 'log-entry-cell-' + field);
    cell.setAttribute('title', value);

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

    cell.innerText = value;
    row.appendChild(cell);
  });

  output.appendChild(row);
  scrollToBottomIfEnabled(output.closest('.tailing') as HTMLElement);
}

function addFirestoreLogEntry(entry: { from: string; data: any }) {
  const output = getElement('.tab-content--firestore .shell-output');
  const shellItem = document.createElement('span');
  shellItem.classList.add('log-from--' + entry.from);
  shellItem.innerText = entry.data;
  output.appendChild(shellItem);
  scrollToBottomIfEnabled(output.closest('.tailing') as HTMLElement);
}

function addDatabaseLogEntry(entry: { from: any; data: any }) {
  const output = getElement('.tab-content--database .shell-output');
  const shellItem = document.createElement('span');
  shellItem.classList.add(
    'log-from--' + (entry.from || 'unknown').toLowerCase()
  );
  shellItem.innerText = entry.data;
  output.appendChild(shellItem);
  scrollToBottomIfEnabled(output.closest('.tailing') as HTMLElement);
}

function openModal(
  selector: string,
  options:
    | string
    | {
        content: string;
        title: string;
        actionButton: string;
        isHTML?: boolean;
      }
) {
  const modal = getElement(selector);

  if (modal) {
    const contentElement = getElement(modal, '.content');

    if (typeof options === 'string') {
      contentElement.innerText = options;
    } else {
      if (options.isHTML) {
        contentElement.innerHTML = options.content;
      } else {
        contentElement.innerText = options.content;
      }

      getElement(modal, '.modal-title').innerText = options.title;

      getElement(modal, '.modal-button-action').innerText =
        options.actionButton;
    }

    modal.classList.add('is-active');
    getElement('html').classList.add('is-clipped');
  }
}

function closeModal(event: Event) {
  const modal = (event.target as HTMLElement).closest('.modal');
  if (modal) {
    modal.classList.remove('is-active');
    getElement('html').classList.remove('is-clipped');
    getElement(modal, '.content').innerHTML = '';
  }
}

function tableClick(event: Event) {
  const row = (event.target as HTMLElement).closest('tr')!;
  const logEntryPos = Number(row.dataset.logEntryPos);
  const entry = logEntries[logEntryPos];
  openModal('.modal-json-viewer', JSON.stringify(entry.data, null, 2));
}

function applyHttpsFuncLogLevel() {
  const table = getElement<HTMLTableElement>(
    '.tab-content--https-functions table'
  );

  ['user', 'info', 'debug', 'error', 'system'].forEach(level => {
    const checkbox = getElement<HTMLInputElement>(
      '#tab-content--https-functions--log-level--' + level
    );

    if (checkbox.checked) {
      table.classList.add('log-level--' + level);
    } else {
      table.classList.remove('log-level--' + level);
    }
  });
}

function scrollToBottomIfEnabled(element: HTMLElement) {
  if (element.dataset.tailEnabled !== 'false') {
    scrollToBottom(element);
  }
}

function scrollToBottom(element: HTMLElement) {
  element.dataset.disableTailOnScroll = 'false';
  element.scrollTo(0, element.scrollHeight);
}

function openTerminateInstanceModal(data: any): void {
  let isInstanceOf: 'database' | 'firestore' | 'functions' | undefined;
  let errorMsg = `<h3>Failed to start the <i>${
    data.emulator.name
  }</i> emulator.</h3>`;

  portBlockingProcessInfo = data.processInfo;

  if (isDatabaseEmulatorInstance(data.processInfo)) {
    isInstanceOf = 'database';
  } else if (isFirestoreEmulatorInstance(data.processInfo)) {
    isInstanceOf = 'firestore';
  } else if (isFunctionsEmulatorInstance(data.processInfo)) {
    isInstanceOf = 'functions';
  }

  if (typeof isInstanceOf === 'string') {
    errorMsg += `
    There's another instance of the ${data.emulator.name} emulator running
    in port ${data.emulator.addr.port}.
    <br/><br/>
    <b>Do you want to terminate it to free the port?</b>
    `;
  } else {
    errorMsg += `
    The port ${
      data.emulator.addr.port
    } is already taken by another unknown program:<br/>
    <pre><code>${JSON.stringify(data.processInfo, null, 2)}</code></pre>
    <b>Do you want to terminate the other program to free the port?</b>
    <br/><br/>
    <i><b>Warning:</b> You might lose data if you terminate it unexpectedly.</i>
    `;
  }

  openModal('.modal-prompt-terminate-other-instance', {
    isHTML: true,
    content: errorMsg,
    title: 'Warning',
    actionButton: 'Terminate program'
  });
}

function handleTerminateInstanceModal(
  event: Event,
  modalButton: HTMLElement
): void {
  if (modalButton.dataset.option === 'cancel') {
    portBlockingProcessInfo = undefined;
    closeModal(event);
  } else if (modalButton.dataset.option === 'action') {
    if (portBlockingProcessInfo) {
      vscode.postMessage({
        command: 'kill-process',
        pid: portBlockingProcessInfo.pid
      });
    }
    closeModal(event);
  }
}

function isDatabaseEmulatorInstance(info: ProcessInfo): boolean {
  return (
    info &&
    contains(info, 'invokingCommand') &&
    info.command === 'java' &&
    /firebase-database-emulator(.+)\.jar/.test(info.invokingCommand!)
  );
}

function isFirestoreEmulatorInstance(info: ProcessInfo): boolean {
  return (
    info &&
    contains(info, 'invokingCommand') &&
    info.command === 'java' &&
    /cloud-firestore-emulator(.+)\.jar/.test(info.invokingCommand!)
  );
}

function isFunctionsEmulatorInstance(info: ProcessInfo): boolean {
  return (
    info &&
    contains(info, 'invokingCommand') &&
    info.command === 'node' &&
    /firebase(.+)emulators:start/.test(info.invokingCommand!)
  );
}

function showDivider(shellOutput: Element, text: string): void {
  const divider = document.createElement('div');
  divider.classList.add('is-divider');
  divider.dataset.content = text.toUpperCase();
  shellOutput.appendChild(divider);
  setTimeout(() => {
    scrollToBottomIfEnabled(shellOutput.closest('.tailing') as HTMLElement);
  }, 0);
}

function getElement<T extends HTMLElement = HTMLElement>(selector: string): T;
function getElement<T extends HTMLElement = HTMLElement>(
  parent: Element,
  selector: string
): T;
function getElement<T extends HTMLElement = HTMLElement>(
  parentOrSelector: string | Element,
  selector?: string
): T {
  if (typeof parentOrSelector === 'string') {
    return document.querySelector(parentOrSelector) as T;
  } else {
    return parentOrSelector.querySelector(selector!) as T;
  }
}

function getElements<T extends HTMLElement = HTMLElement>(
  selector: string
): NodeListOf<T>;
function getElements<T extends HTMLElement = HTMLElement>(
  parent: Element,
  selector: string
): NodeListOf<T>;
function getElements<T extends HTMLElement = HTMLElement>(
  parentOrSelector: string | Element,
  selector?: string
): NodeListOf<T> {
  if (typeof parentOrSelector === 'string') {
    return document.querySelectorAll(parentOrSelector);
  } else {
    return parentOrSelector.querySelectorAll(selector!);
  }
}

function contains<T extends object, K extends string>(
  obj: T,
  field: K
): boolean {
  return Object.prototype.hasOwnProperty.call(obj, field);
}
