import { Store } from '../stores';
import { ProjectInfo } from './ProjectManager';

export class ProjectStore implements Store<ProjectInfo> {
  store = new Map<string, ProjectInfo>();

  get(projectId: string): ProjectInfo {
    return this.store.get(projectId)!;
  }

  add(projectId: string, project: ProjectInfo): void {
    this.store.set(projectId, project);
  }
}
