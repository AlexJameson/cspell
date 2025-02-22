import type { ServiceRequestFactoryRequestType } from '@cspell/cspell-service-bus';
import { requestFactory } from '@cspell/cspell-service-bus';

import type { BufferEncoding } from '../models/BufferEncoding.js';
import type { FileResource } from '../models/FileResource.js';

const RequestType = 'fs:readFileSync' as const;
interface RequestParams {
    readonly url: URL;
    readonly encoding?: BufferEncoding | undefined;
}
export const RequestFsReadFileTextSync = requestFactory<typeof RequestType, RequestParams, FileResource>(RequestType);
export type RequestFsReadFileTextSync = ServiceRequestFactoryRequestType<typeof RequestFsReadFileTextSync>;
