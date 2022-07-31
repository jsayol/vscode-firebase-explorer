import * as vscode from 'vscode';
import { FirebaseProject } from '../projects/ProjectManager';
import { messageTreeItem, getFilePath } from '../utils';
import { AccountInfo } from '../accounts/AccountManager';
import { StorageManager } from './StorageManager';

export class StorageProvider implements vscode.TreeDataProvider<StorageProviderItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<StorageProviderItem | undefined>();

  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private context: vscode.ExtensionContext) { }

  refresh(element?: StorageProviderItem): void {
    this._onDidChangeTreeData.fire(element);
  }

  getTreeItem(element: StorageProviderItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: StorageProviderItem): Promise<StorageProviderItem[]> {
    const account = this.context.globalState.get<AccountInfo>('selectedAccount');
    const project = this.context.globalState.get<FirebaseProject | null>('selectedProject');

    if (project === null) {
      return [messageTreeItem('Loading...')];
    }

    if (!account || !project) {
      return [];
    }

    const storageManager = StorageManager.for(account, project);
    if (!element) {
      const buckets = await storageManager.listBuckets();
      return buckets.items ? buckets.items.map(bucket => new BucketTreeItem(bucket)) : [];
    } else if (element instanceof BucketTreeItem) {
      const objectListResponse = await storageManager.listObjects(element.bucket);

      if (!objectListResponse.prefixes && !objectListResponse.items) {
        return [messageTreeItem('Bucket is empty')];
      }

      const folders = (objectListResponse.prefixes || []).map(prefix => new ObjectPrefixTreeItem(element.bucket, prefix, ''));
      const storageObjects = (objectListResponse.items || []).map((object: Object) => new ObjectTreeItem(element.bucket, object, ''));

      return [
        ...folders,
        ...storageObjects,
      ];
    } else if (element instanceof ObjectPrefixTreeItem) {
      const objectListResponse = await storageManager.listObjects(element.bucket, element.prefix);

      if (!objectListResponse.prefixes && objectListResponse.items.length === 1 && objectListResponse.items[0].name === element.prefix) {
        return [messageTreeItem('Folder is empty')];
      }

      const folders = (objectListResponse.prefixes || []).map(prefix => new ObjectPrefixTreeItem(element.bucket, prefix, element.prefix));
      const storageObjects = (objectListResponse.items || [])
        .map((object: Object) => object.name === element.prefix ?
          null :
          new ObjectTreeItem(element.bucket, object, element.prefix))
        .filter(Boolean) as ObjectTreeItem[];

      return [
        ...folders,
        ...storageObjects,
      ];
    }

    return [
      messageTreeItem('No Storage Bucket for this project')
    ];
  }
}

export class BucketTreeItem extends vscode.TreeItem {
  iconPath = getFilePath('assets', 'firebase-color-small.svg');

  constructor(public bucket: Bucket) {
    super(bucket.name, vscode.TreeItemCollapsibleState.Collapsed);
  }

  get tooltip(): string {
    return this.bucket.name;
  }
}

export class ObjectTreeItem extends vscode.TreeItem {

  constructor(public bucket: Bucket, public object: Object, public prefix: string) {
    super(object.name.replace(prefix, ''), vscode.TreeItemCollapsibleState.None);
  }

  get tooltip(): string {
    return this.object.name.replace(this.prefix, '');
  }
}

export class ObjectPrefixTreeItem extends vscode.TreeItem {
  contextValue = 'storage';
  // iconPath = TODOD;

  constructor(public bucket: Bucket, public prefix: string, public elementPrefix: string) {
    super(prefix.replace(elementPrefix, ''), vscode.TreeItemCollapsibleState.Collapsed);
  }

  get tooltip(): string {
    return this.prefix.replace(this.elementPrefix, '');
  }
}

export type StorageProviderItem = BucketTreeItem | ObjectTreeItem | ObjectPrefixTreeItem;

export interface BucketListResponse {
  kind: 'storage#buckets';
  nextPageToken?: string;
  items?: Bucket[];
}

export interface Bucket {
  kind: 'storage#bucket';
  id: string;
  selfLink: string;
  projectNumber: number;
  name: string;
  timeCreated: Date;
  updated: Date;
  defaultEventBasedHold: boolean;
  retentionPolicy: {
    retentionPeriod: number,
    effectiveTime: Date,
    isLocked: boolean
  };
  metageneration: number;
  acl: BucketAccessControls[];
  defaultObjectAcl: DefaultObjectAccessControls[];
  iamConfiguration: {
    bucketPolicyOnly: {
      enabled: boolean,
      lockedTime: Date
    }
  };
  encryption: {
    defaultKmsKeyName: string
  };
  owner: {
    entity: string,
    entityId: string
  };
  location: string;
  website: {
    mainPageSuffix: string,
    notFoundPage: string
  };
  logging: {
    logBucket: string,
    logObjectPrefix: string
  };
  versioning: {
    enabled: boolean
  };
  cors: {
    origin: string[],
    method: string[],
    responseHeader: string[],
    maxAgeSeconds: number;
  }[];
  lifecycle: {
    rule: {
      action: {
        type: string,
        storageClass: string
      },
      condition: {
        age: number,
        createdBefore: Date,
        isLive: boolean,
        matchesStorageClass: string[],
        numNewerVersions: number
      }
    }[]
  };
  labels: {
    [key: string]: string
  };
  storageClass: string;
  billing: {
    requesterPays: boolean
  };
  etag: string;
}

export interface BucketAccessControls {
  kind: 'storage#bucketAccessControl';
  id: string;
  selfLink: string;
  bucket: string;
  entity: string;
  role: string;
  email: string;
  entityId: string;
  domain: string;
  projectTeam: {
    projectNumber: string,
    team: string
  };
  etag: string;
}

export interface DefaultObjectAccessControls {
  kind: 'storage#objectAccessControl';
  entity: string;
  role: string;
  email: string;
  entityId: string;
  domain: string;
  projectTeam: {
    projectNumber: string,
    team: string
  };
  etag: string;
}

export interface ObjectListResponse {
  kind: "storage#objects";
  nextPageToken?: string;
  prefixes?: string[];
  items: Object[];
}

export interface Object {
  kind: 'storage#object';
  id: string;
  selfLink: string;
  name: string;
  bucket: string;
  generation: number;
  metageneration: number;
  contentType: string;
  timeCreated: Date;
  updated: Date;
  timeDeleted: Date;
  temporaryHold: boolean;
  eventBasedHold: boolean;
  retentionExpirationTime: Date;
  storageClass: string;
  timeStorageClassUpdated: Date;
  size: number;
  md5Hash: string;
  mediaLink: string;
  contentEncoding: string;
  contentDisposition: string;
  contentLanguage: string;
  cacheControl: string;
  metadata: {
    [key: string]: string
  };
  acl: ObjectAccessControls[];
  owner: {
    entity: string,
    entityId: string
  };
  crc32c: string;
  componentCount: number;
  etag: string;
  customerEncryption: {
    encryptionAlgorithm: string,
    keySha256: string
  };
  kmsKeyName: string;
}

export interface ObjectAccessControls {
  kind: 'storage#objectAccessControl';
  id: string;
  selfLink: string;
  bucket: string;
  object: string;
  generation: number;
  entity: string;
  role: string;
  email: string;
  entityId: string;
  domain: string;
  projectTeam: {
    projectNumber: string,
    team: string
  };
  etag: string;
}
