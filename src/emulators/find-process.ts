/**
 * Adapted from https://github.com/yibn2008/find-process
 */

import * as childProcess from 'child_process';
import { contains } from '../utils';

type FinderFn = (port: string | number) => Promise<any>;

interface Finders {
  darwin: FinderFn;
  linux: FinderFn;
  win32: FinderFn;
  freebsd: string;
  sunos: string;
}

export function findPidByPort(port: string | number): Promise<number> {
  let platform = process.platform as keyof Finders;

  return new Promise((resolve, reject) => {
    if (!contains(finders, platform)) {
      reject(new Error(`platform ${platform} is unsupported`));
      return;
    }

    let finder = finders[platform];
    if (typeof finder === 'string') {
      finder = finders[finder as keyof Finders] as FinderFn;
    }

    finder(port).then(resolve, reject);
  });
}

const finders: Finders = {
  darwin(port: string | number) {
    return new Promise((resolve, reject) => {
      exec('netstat -anv -p TCP', function(
        err: any,
        stdout: Object,
        stderr: Object
      ) {
        if (err) {
          reject(err);
        } else {
          err = stderr.toString().trim();
          if (err) {
            reject(err);
            return;
          }

          // replace header
          let data = stripLine(stdout.toString(), 2);
          let found = extractColumns(data, [0, 3, 8], 10)
            .filter((row: any[]) => {
              return !!String(row[0]).match(/^tcp/);
            })
            .find((row: any[]) => {
              let matches = String(row[1]).match(/\.(\d+)$/);
              return (matches || false) && matches[1] === String(port);
            });

          if (found && found[2].length) {
            resolve(parseInt(found[2], 10));
          } else {
            reject(new Error(`pid of port (${port}) not found`));
          }
        }
      });
    });
  },

  freebsd: 'darwin',

  sunos: 'darwin',

  linux(port: string | number) {
    return new Promise((resolve, reject) => {
      let cmd = 'netstat -tnlp';

      exec(cmd, function(err: any, stdout: Object, stderr: Object) {
        if (err) {
          reject(err);
        } else {
          // replace header
          let data = stripLine(stdout.toString(), 2);
          let columns = extractColumns(data, [3, 6], 7).find(
            (column: any[]) => {
              let matches = String(column[0]).match(/:(\d+)$/);
              return (matches || false) && matches[1] === String(port);
            }
          );

          if (columns && columns[1]) {
            let pid = columns[1].split('/', 1)[0];

            if (pid.length) {
              resolve(parseInt(pid, 10));
            } else {
              reject(new Error(`pid of port (${port}) not found`));
            }
          } else {
            err = stderr.toString().trim();
            if (err) {
              console.error(err);
              reject(err);
              return;
            } else {
              reject(new Error(`pid of port (${port}) not found`));
            }
          }
        }
      });
    });
  },

  win32(port: string | number) {
    return new Promise((resolve, reject) => {
      exec('netstat -ano', function(err: any, stdout: Object, stderr: Object) {
        if (err) {
          reject(err);
        } else {
          err = stderr.toString().trim();
          if (err) {
            reject(err);
            return;
          }

          // replace header
          let data = stripLine(stdout.toString(), 4);
          let columns = extractColumns(data, [1, 4], 5).find(
            (column: any[]) => {
              let matches = String(column[0]).match(/:(\d+)$/);
              return (matches || false) && matches[1] === String(port);
            }
          );

          if (columns && columns[1].length && parseInt(columns[1], 10) > 0) {
            resolve(parseInt(columns[1], 10));
          } else {
            reject(new Error(`pid of port (${port}) not found`));
          }
        }
      });
    });
  }
};

/**
 * exec command with maxBuffer size
 */
function exec(cmd: string, callback: any) {
  childProcess.exec(
    cmd,
    {
      maxBuffer: 2 * 1024 * 1024, // MB
      windowsHide: true
    },
    callback
  );
}

/**
 * Strip top lines of text
 */
function stripLine(text: string, num: number): string {
  let idx = 0;

  while (num-- > 0) {
    let nIdx = text.indexOf('\n', idx);
    if (nIdx >= 0) {
      idx = nIdx + 1;
    }
  }

  return idx > 0 ? text.substring(idx) : text;
}

/**
 * Split string and stop at max parts
 */
function split(line: string, max: number): string[] {
  let cols = line.trim().split(/\s+/);

  if (cols.length > max) {
    cols[max - 1] = cols.slice(max - 1).join(' ');
  }

  return cols;
}

/**
 * Extract columns from table text
 */
function extractColumns(
  text: string,
  idxes: number[],
  max: number
): string[][] {
  let lines = text.split(/(\r\n|\n|\r)/);
  let columns: string[][] = [];

  if (!max) {
    max = Math.max.apply(null, idxes) + 1;
  }

  lines.forEach(line => {
    let cols = split(line, max);
    let column: string[] = [];

    idxes.forEach(idx => {
      column.push(cols[idx] || '');
    });

    columns.push(column);
  });

  return columns;
}
