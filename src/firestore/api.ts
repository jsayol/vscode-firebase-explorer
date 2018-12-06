import * as request from 'request-promise-native';
import { contains } from '../utils';
import { AccountInfo } from '../accounts/interfaces';
import { FirebaseProject, ProjectManager } from '../projects/ProjectManager';

const URL_BASE = 'https://firestore.googleapis.com/v1beta1';
const singletons: { [k: string]: FirestoreAPI } = {};

export function getFirestoreAPI(
  account: AccountInfo,
  project: FirebaseProject
): FirestoreAPI {
  const id = account.user.email + '--' + project.id;

  if (!contains(singletons, id)) {
    singletons[id] = new FirestoreAPI(account, project);
  }

  return singletons[id];
}

class FirestoreAPI {
  projectId: string;
  projectManager: ProjectManager;

  constructor(account: AccountInfo, project: FirebaseProject) {
    this.projectId = project.id;
    this.projectManager = ProjectManager.for(account, project);
  }

  async listCollections(
    path = '',
    pageSize = 300,
    pageToken?: string
  ): Promise<CollectionsList> {
    const token = await this.projectManager.getAccessToken();
    const reqOptions: request.OptionsWithUrl = {
      method: 'POST',
      url: this.getURLForPath(path) + ':listCollectionIds',
      json: true,
      headers: {
        Authorization: `Bearer ${token.access_token}`
      },
      body: { pageSize, pageToken }
    };

    return request(reqOptions);
  }

  async listDocuments(
    path: string,
    pageSize = 300,
    pageToken?: string
  ): Promise<DocumentsList> {
    const token = await this.projectManager.getAccessToken();
    const reqOptions: request.OptionsWithUrl = {
      method: 'GET',
      url: this.getURLForPath(path),
      json: true,
      headers: {
        Authorization: `Bearer ${token.access_token}`
      },
      qs: {
        pageSize,
        pageToken,
        showMissing: true,
        'mask.fieldPaths': '_none_'
      }
    };

    const result: InternalDocumentsList = await request(reqOptions);
    result.documents.forEach(processDates);
    return {
      ...result,
      documents: result.documents.map(processDates)
    };
  }

  async getDocument(path: string): Promise<FirestoreDocument> {
    const token = await this.projectManager.getAccessToken();
    const reqOptions: request.OptionsWithUrl = {
      method: 'GET',
      url: this.getURLForPath(path),
      json: true,
      headers: {
        Authorization: `Bearer ${token.access_token}`
      }
    };

    const doc: InternalFirestoreDocument = await request(reqOptions);
    return processDates(doc);
  }

  private getURLForPath(path: string): string {
    return `${URL_BASE}/projects/${
      this.projectId
    }/databases/(default)/documents/${path}`;
  }
}

function processDates(doc: InternalFirestoreDocument): FirestoreDocument {
  if (doc.createTime) {
    (doc as FirestoreDocument).createTime = new Date(doc.createTime);
  }
  if (doc.updateTime) {
    (doc as FirestoreDocument).updateTime = new Date(doc.updateTime);
  }

  return doc as FirestoreDocument;
}

export interface CollectionsList {
  collectionIds: string[];
  nextPageToken?: string;
}

export interface DocumentsList {
  documents: FirestoreDocument[];
  nextPageToken?: string;
}

export interface FirestoreDocument {
  name: string;
  fields?: { [name: string]: DocumentFieldValue };
  createTime?: Date;
  updateTime?: Date;
}

interface InternalDocumentsList {
  documents: InternalFirestoreDocument[];
  nextPageToken?: string;
}

interface InternalFirestoreDocument {
  name: string;
  fields?: { [name: string]: DocumentFieldValue };
  createTime?: string;
  updateTime?: string;
}

export interface DocumentFieldNullValue {
  nullValue: null;
}

export interface DocumentFieldBooleanValue {
  booleanValue: boolean;
}

export interface DocumentFieldIntegerValue {
  integerValue: string;
}

export interface DocumentFieldDoubleValue {
  doubleValue: number;
}

export interface DocumentFieldTimestampValue {
  timestampValue: string;
}

export interface DocumentFieldStringValue {
  stringValue: string;
}

export interface DocumentFieldBytesValue {
  bytesValue: string;
}

export interface DocumentFieldReferenceValue {
  referenceValue: string;
}

export interface DocumentFieldGeoPointValue {
  geoPointValue: {
    latitude: number;
    longitude: number;
  };
}

export interface DocumentFieldArrayValue {
  arrayValue: DocumentFieldValue[];
}

export interface DocumentFieldMapValue {
  mapValue: {
    fields: { [name: string]: DocumentFieldValue };
  };
}

export type DocumentFieldValue =
  | DocumentFieldNullValue
  | DocumentFieldBooleanValue
  | DocumentFieldIntegerValue
  | DocumentFieldDoubleValue
  | DocumentFieldTimestampValue
  | DocumentFieldStringValue
  | DocumentFieldBytesValue
  | DocumentFieldReferenceValue
  | DocumentFieldGeoPointValue
  | DocumentFieldArrayValue
  | DocumentFieldMapValue;
