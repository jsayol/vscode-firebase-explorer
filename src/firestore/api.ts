import * as request from 'request-promise-native';
import { contains } from '../utils';
import { AccountInfo } from '../accounts/interfaces';
import { FirebaseProject, ProjectManager } from '../projects/ProjectManager';

const URL_BASE = 'https://firestore.googleapis.com/v1beta1';
const instances: { [k: string]: FirestoreAPI } = {};

export class FirestoreAPI {
  static for(account: AccountInfo, project: FirebaseProject): FirestoreAPI {
    const id = account.user.email + '--' + project.projectId;

    if (!contains(instances, id)) {
      instances[id] = new FirestoreAPI(account, project);
    }

    return instances[id];
  }

  projectId: string;
  projectManager: ProjectManager;

  private constructor(account: AccountInfo, project: FirebaseProject) {
    this.projectId = project.projectId;
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

  async deleteDocument(path: string): Promise<void> {
    const token = await this.projectManager.getAccessToken();
    const reqOptions: request.OptionsWithUrl = {
      method: 'DELETE',
      url: this.getURLForPath(path),
      json: true,
      headers: {
        Authorization: `Bearer ${token.access_token}`
      }
    };

    await request(reqOptions);
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

export function processFieldValue(
  field: DocumentFieldValue
): { type: string; value: any } {
  if (contains(field, 'nullValue')) {
    return { type: 'null', value: (field as any).nullValue };
  }

  if (contains(field, 'booleanValue')) {
    return { type: 'boolean', value: (field as any).booleanValue };
  }

  if (contains(field, 'integerValue')) {
    return { type: 'integer', value: (field as any).integerValue };
  }

  if (contains(field, 'doubleValue')) {
    return { type: 'double', value: (field as any).doubleValue };
  }

  if (contains(field, 'timestampValue')) {
    return { type: 'timestamp', value: (field as any).timestampValue };
  }

  if (contains(field, 'stringValue')) {
    return { type: 'string', value: (field as any).stringValue };
  }

  if (contains(field, 'bytesValue')) {
    return { type: 'bytes', value: (field as any).bytesValue };
  }

  if (contains(field, 'referenceValue')) {
    return { type: 'reference', value: (field as any).referenceValue };
  }

  if (contains(field, 'geoPointValue')) {
    return { type: 'geopoint', value: (field as any).geoPointValue };
  }

  if (contains(field, 'arrayValue')) {
    return { type: 'array', value: (field as any).arrayValue };
  }

  if (contains(field, 'mapValue')) {
    return { type: 'map', value: (field as any).mapValue };
  }

  throw new Error('Unknow field type');
}

export function getFieldArrayValue(values: DocumentFieldValue[]): any[] {
  return values.map(val => {
    const itemVal = processFieldValue(val);
    if (itemVal.type === 'array') {
      return getFieldArrayValue(itemVal.value.values);
    } else {
      return itemVal.value;
    }
  });
}

export function getFieldValue(field: DocumentFieldValue): any {
  const { type, value } = processFieldValue(field);

  if (type === 'array') {
    return getFieldArrayValue(value.values);
  } else if (type === 'map') {
    return Object.keys(value.fields)
      .map(
        (childKey): { key: string; val: any } => {
          const childField: DocumentFieldValue = value.fields[childKey];
          return { key: childKey, val: getFieldValue(childField) };
        }
      )
      .reduce(
        (result, item) => {
          result[item.key] = item.val;
          return result;
        },
        {} as { [k: string]: any }
      );
  } else {
    return value;
  }
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
  integerValue: number;
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
  arrayValue: {
    values: DocumentFieldValue[];
  };
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
