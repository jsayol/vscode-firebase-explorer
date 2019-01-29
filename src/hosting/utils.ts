import { HostingReleaseVersionFile } from './api';
import { caseInsensitiveCompare } from '../utils';

export function filesToTree(
  files: HostingReleaseVersionFile[]
): PathTreePart[] {
  const tree: PathTreePart[] = [];
  const paths: string[] = files.map(file => file.path);

  for (let pathIndex = 0; pathIndex < paths.length; pathIndex++) {
    const pathParts = paths[pathIndex].replace(/(^\/)|(\/$)/, '').split('/');
    let currentLevel = tree;
    for (
      let pathPartIndex = 0;
      pathPartIndex < pathParts.length;
      pathPartIndex++
    ) {
      const pathPart = pathParts[pathPartIndex];
      const existingPart = findInTree(currentLevel, pathPart);

      if (existingPart) {
        currentLevel = existingPart.children;
      } else {
        const newPart: PathTreePart = {
          name: pathPart,
          children: []
        };

        if (pathPartIndex === pathParts.length - 1) {
          newPart.file = files[pathIndex];
        }

        currentLevel.push(newPart);
        currentLevel = newPart.children;
      }
    }
  }

  return tree;

  function findInTree(
    pathPartTree: PathTreePart[],
    pathPart: string
  ): PathTreePart | null {
    let i = 0;

    while (i < pathPartTree.length && pathPartTree[i].name !== pathPart) {
      i++;
    }

    if (i < pathPartTree.length) {
      return pathPartTree[i];
    } else {
      return null;
    }
  }
}

export interface PathTreePart {
  name: string;
  children: PathTreePart[];
  file?: HostingReleaseVersionFile;
}

export function sortTreeParts(parts: PathTreePart[]): PathTreePart[] {
  return parts.sort((a, b) => {
    if (!a.file && b.file) {
      return -1;
    } else if (a.file && !b.file) {
      return 1;
    } else {
      return caseInsensitiveCompare(a.name, b.name);
    }
  });
}
