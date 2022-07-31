import * as vscode from 'vscode';
import * as request from 'request-promise-native';
import { contains } from '../utils';
import { FirebaseProject } from '../projects/ProjectManager';
import {
  AccountManager,
  AccountInfo,
  RequestOptions
} from '../accounts/AccountManager';
import { API } from '../api';
import { Bucket, BucketListResponse, ObjectListResponse } from './StorageProvider';

const instances: { [k: string]: StorageAPI } = {};

export class StorageAPI {
  static for(accountInfo: AccountInfo, project: FirebaseProject): StorageAPI {
    const id = accountInfo.user.email + '--' + project.projectId;
    if (!contains(instances, id)) {
      instances[id] = new StorageAPI(accountInfo, project);
    }
    return instances[id];
  }

  accountManager: AccountManager;

  private constructor(
    accountInfo: AccountInfo,
    public project: FirebaseProject
  ) {
    this.accountManager = AccountManager.for(accountInfo);
  }

  private request(
    method: string,
    paths: string[],
    options: RequestOptions = {},
  ): Promise<request.FullResponse> {
    const url = [
      API.storage.origin,
      API.storage.version,
      'b',
      ...paths
    ].join('/');
    return this.accountManager.request(method, url, options);
  }

  async listBuckets(project: string): Promise<BucketListResponse | null> {
    try {
      const response = await this.request('GET', [], {
        qs: {
          project
        }
      });

      if (response.statusCode === 200) {
        return response.body;
      }
    } catch (err) {
      console.log('ERR listBuckets');
    }

    vscode.window.showErrorMessage(
      `Failed to retrieve storage buckets for ${project}`
    );

    return null;
  }

  async listObjects(bucket: Bucket, prefix?: string): Promise<ObjectListResponse | null> {
    try {
      const response = await this.request('GET', [bucket.name, 'o'], {
        qs: {
          delimiter: '/',
          prefix,
        },
      });

      if (response.statusCode === 200) {
        return response.body;
      }
    } catch (err) {
      console.log('ERR listObjects');
    }

    vscode.window.showErrorMessage(
      `Failed to retrieve storage objects for ${bucket.name}`
    );

    return null;
  }

}
