declare const acquireVsCodeApi: () => {
  postMessage: (msg: any) => void;
  setState: <T>(newState: T) => T;
  getState: () => any;
};

const vscode = acquireVsCodeApi();

const startButton = document.querySelector('.controls .button.start')!;
const stopButton = document.querySelector('.controls .button.stop')!;

const projectSelector = document.querySelector(
  '.top-controls .project-selector'
) as HTMLSelectElement;

const workspaceSelector = document.querySelector(
  '.top-controls .workspace-selector'
)!;

let logEntries: any[] = [];

let portBlockingProcessInfo: any;

setupDOMListeners();

window.addEventListener('message', ({ data }) => {
  switch (data.command) {
    case 'initialize':
      initialize(data);
      break;
    case 'stdout':
    case 'stderr':
      console.log(data);
      showCLIOutput(data);
      break;
    case 'log':
      addLogEntry(data.message);
      break;
    case 'server-closed':
      stopped();
      break;
    case 'focus':
      // The webview got focus.
      break;
    case 'error':
      // TODO
      console.log(data);
      break;
    case 'who-has-port-response':
      // TODO: detect if it's an emulator or some other program. Show a message accordingly.
      portBlockingProcessInfo = data.processInfo;
      const errorMsg = `
      The ${data.module} emulator couldn't start because the port is
      already taken.<br/>
      <br/>
      Do you want to try to terminate it?
    `;
      openModal('.modal-prompt-terminate-other-instance', errorMsg, true);
      break;
    case 'kill-process-result':
      portBlockingProcessInfo = undefined;
      // TODO: show success/fail?
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
  document
    .querySelector('.tabs.main-navigation')!
    .addEventListener('click', openTab);
});

function setupDOMListeners() {
  document
    .querySelector('.tab-content--dashboard .controls .button.start')!
    .addEventListener('click', start);

  document
    .querySelector('.tab-content--dashboard .controls .button.stop')!
    .addEventListener('click', stop);

  document
    .querySelector('#switch-emu-all')!
    .addEventListener('change', toggleAllEmulatorsSwitch);

  document
    .querySelectorAll(
      '.tab-content--https-functions .log-level-selection input.is-checkradio'
    )
    .forEach(input => {
      input.addEventListener('change', applyHttpsFuncLogLevel);
    });

  document
    .querySelector('.tab-content--https-functions .logging-table')!
    .addEventListener('click', tableClick);

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
      if (modalButton.dataset.option === 'cancel') {
        portBlockingProcessInfo = undefined;
        closeModal(event);
      } else if (modalButton.dataset.option === 'terminate') {
        console.log('Trying to terminate', portBlockingProcessInfo);
        if (portBlockingProcessInfo) {
          vscode.postMessage({
            command: 'kill-process',
            pid: portBlockingProcessInfo.pid
          });
        }
        closeModal(event);
      }
      return;
    }
  });

  document.querySelectorAll('.tailing').forEach(container => {
    container.addEventListener('scroll', () => {
      const element = container as HTMLElement;
      const dataset = element.dataset;

      if (dataset.tailEnabled === 'false') {
        const distanceFromBottom =
          element.scrollHeight - element.scrollTop - element.offsetHeight;
        if (distanceFromBottom <= 15) {
          dataset.tailEnabled = 'true';
        }
      } else if (dataset.disableTailOnScroll !== 'false') {
        dataset.tailEnabled = 'false';
      }

      dataset.disableTailOnScroll = 'true';
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

  const shellOutput = document.querySelector(
    '.tab-content--dashboard .shell-output'
  ) as HTMLElement;

  if (shellOutput.children.length > 0) {
    const divider = document.createElement('div');
    divider.classList.add('is-divider');
    divider.dataset.content = 'START';
    shellOutput.appendChild(divider);
  }
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
    const field = document.querySelector(
      '.top-controls .workspace-selector-field'
    )!;
    field.classList.remove('hidden');
  }

  logEntries = [];

  applyHttpsFuncLogLevel();
}

function showCLIOutput(data: { command: string; message: string }) {
  const shellOutput = document.querySelector(
    '.tab-content--dashboard .shell-output'
  ) as HTMLElement;

  const shellItem = document.createElement('div');
  shellItem.classList.add('item', 'item-' + data.command);
  shellItem.innerHTML = data.message;
  shellOutput.appendChild(shellItem);
  scrollToBottomIfEnabled(shellOutput.closest('.tailing') as HTMLElement);

  parseSpecialMessages(data);
}

function isSwitchEnabled(id: string) {
  const elem = document.querySelector<HTMLInputElement>('#' + id)!;
  return elem.checked;
}

function toggleAllEmulatorsSwitch(event: Event) {
  const isChecked = (event.currentTarget as HTMLInputElement).checked;
  ['functions', 'firestore', 'database'].forEach(service => {
    const element = document.querySelector('#switch-emu-' + service);
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

    const tabs = document.querySelectorAll('.tabs li');
    tabs.forEach(tab => {
      const isSelected = tab.classList.contains('tab--' + tabName);
      if (isSelected) {
        tab.classList.add('is-active');
      } else {
        tab.classList.remove('is-active');
      }
    });

    const contents = document.querySelectorAll('.tab-content');
    contents.forEach(tabContent => {
      const isSelected = tabContent.classList.contains(
        'tab-content--' + tabName
      );
      if (isSelected) {
        tabContent.classList.add('is-active');
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

  const output = document.querySelector(
    `.tab-content--${functionType}-functions table tbody`
  )!;
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
}

function addFirestoreLogEntry(entry: { from: string; data: any }) {
  const output = document.querySelector(
    '.tab-content--firestore .shell-output'
  )!;
  const shellItem = document.createElement('span');
  shellItem.classList.add('log-from--' + entry.from);
  shellItem.innerText = entry.data;
  output.appendChild(shellItem);
}

function addDatabaseLogEntry(entry: { from: any; data: any }) {
  const output = document.querySelector(
    '.tab-content--database .shell-output'
  )!;
  const shellItem = document.createElement('span');
  shellItem.classList.add(
    'log-from--' + (entry.from || 'unknown').toLowerCase()
  );
  shellItem.innerText = entry.data;
  output.appendChild(shellItem);
}

function openModal(selector: string, content: string, isHTML = false) {
  const modal = document.querySelector(selector) as HTMLElement;
  if (modal) {
    const contentElement = modal.querySelector('.content') as HTMLElement;
    if (isHTML) {
      contentElement.innerHTML = content;
    } else {
      contentElement.innerText = content;
    }
    modal.classList.add('is-active');
    document.querySelector('html')!.classList.add('is-clipped');
  }
}

function closeModal(event: Event) {
  const modal = (event.target as HTMLElement).closest('.modal');
  if (modal) {
    modal.classList.remove('is-active');
    document.querySelector('html')!.classList.remove('is-clipped');
    (modal.querySelector('.content') as HTMLElement).innerHTML = '';
  }
}

function tableClick(event: Event) {
  const row = (event.target as HTMLElement).closest('tr')!;
  const logEntryPos = Number(row.dataset.logEntryPos);
  const entry = logEntries[logEntryPos];
  openModal('.modal-json-viewer', JSON.stringify(entry.data, null, 2));
}

function applyHttpsFuncLogLevel() {
  const table = document.querySelector<HTMLTableElement>(
    '.tab-content--https-functions table'
  )!;

  ['user', 'info', 'debug', 'error', 'system'].forEach(level => {
    const checkbox = document.querySelector<HTMLInputElement>(
      '#tab-content--https-functions--log-level--' + level
    )!;

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

function parseSpecialMessages(data: {
  command: string;
  message: string;
}): void {
  // TODO: put some order in this mess
  if (
    data.command === 'stderr' &&
    /Could not start database emulator, port taken/.test(data.message)
  ) {
    vscode.postMessage({
      command: 'who-has-port',
      port: 9000, // TODO: take this from the "pid" message we get from the CLI
      module: 'Database'
    });
  } else if (
    data.command === 'stderr' &&
    /Could not start firestore emulator, port taken/.test(data.message)
  ) {
    vscode.postMessage({
      command: 'who-has-port',
      port: 8080, // TODO: take this from the "pid" message we get from the CLI
      module: 'Firestore'
    });
  } else if (
    data.command === 'stderr' &&
    /Could not start functions emulator, port taken/.test(data.message)
  ) {
    vscode.postMessage({
      command: 'who-has-port',
      port: 8088, // TODO: take this from the "pid" message we get from the CLI
      module: 'Functions'
    });
  }
}
