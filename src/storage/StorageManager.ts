import { contains } from '../utils';
import { AccountInfo, AccountManager } from '../accounts/AccountManager';
import { FirebaseProject } from '../projects/ProjectManager';
import { StorageAPI } from './api';
import { BucketListResponse, Bucket, ObjectListResponse } from './StorageProvider';

const instances: { [k: string]: StorageManager } = {};

export class StorageManager {
  readonly accountManager: AccountManager;

  private constructor(accountInfo: AccountInfo, public readonly project: FirebaseProject) {
    this.accountManager = AccountManager.for(accountInfo);
  }

  static for(infoOrEmail: AccountInfo | string, projectOrId: FirebaseProject | string): StorageManager {
    let accountInfo: AccountInfo;
    let project: FirebaseProject;

    if (typeof infoOrEmail === 'string') {
      // "account" is an email, let's find the AccountInfo.
      const foundInfo = AccountManager.getInfoForEmail(infoOrEmail);

      if (!foundInfo) {
        throw new Error('Account not found for email ' + infoOrEmail);
      }

      accountInfo = foundInfo;
    } else {
      accountInfo = infoOrEmail;
    }

    if (typeof projectOrId === 'string') {
      // "projectOrId" is the projectId, let's find the FirebaseProject.
      const projects = AccountManager.for(accountInfo).listProjectsSync();

      if (!projects) {
        throw new Error('No projects found for email ' + infoOrEmail);
      }

      const foundProject = projects.find(
        _project => _project.projectId === projectOrId
      );

      if (!foundProject) {
        throw new Error('Project not found for projectId ' + projectOrId);
      }

      project = foundProject;
    } else {
      project = projectOrId;
    }

    const id = accountInfo.user.email + '--' + project.projectId;
    if (!contains(instances, id)) {
      instances[id] = new StorageManager(accountInfo, project);
    }
    return instances[id];
  }

  getAccessToken(): Promise<string> {
    return this.accountManager.getAccessToken();
  }

  async listBuckets(): Promise<BucketListResponse> {
    try {
      const api = StorageAPI.for(this.accountManager.info, this.project);
      const response = await api.listBuckets(this.project.projectId);
      return response || {
        kind: "storage#buckets"
      };
    } catch (err) {
      // TODO: handle error
      console.error('apps', { err });
      console.log((err as Error).stack);
      return {
        kind: "storage#buckets"
      };
    }
  }

  async listObjects(bucket: Bucket, prefix?: string): Promise<ObjectListResponse> {
    try {
      const api = StorageAPI.for(this.accountManager.info, this.project);
      const response = await api.listObjects(bucket, prefix);
      return response || {
        kind: "storage#objects",
        items: [],
      };
    } catch (err) {
      // TODO: handle error
      console.error('apps', { err });
      console.log((err as Error).stack);
      return {
        kind: "storage#objects",
        items: [],
      };
    }
  }
}
