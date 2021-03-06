import { AxiosResponse } from 'axios';
import {
  CreateFileRequest,
  CreatePartRequest,
  Part,
  PartData,
  PartList,
  PartRevisionData,
  PartRevisionList,
} from '../../index';
import {
  BaseArgs,
  DeleteArgs,
  encodeIfNotEncoded,
  getBySuppliedId,
  getPage,
  head,
  Polling,
  pollQueuedJob,
  prettyJson,
  RenderImageArgs,
  uploadFileIfNotExists,
} from '../index';

/** Create parts from file arguments. */
interface CreatePartFromFileArgs extends BaseArgs {
  /** A {@link CreateFileRequest}. */
  readonly createFileReq: CreateFileRequest;

  /** Function returning a {@link CreatePartRequest}. */
  readonly createPartReq: (fileId: string) => CreatePartRequest;

  /** File data, use {@link Buffer} in Node. */
  readonly fileData: unknown;

  /** {@link Polling} */
  readonly polling?: Polling;
}

/** Get part revision by supplied ID arguments. */
interface GetPartRevisionBySuppliedIdArgs extends BaseArgs {
  /** A supplied part ID. */
  readonly suppliedPartId: string;

  /** A supplied part revision ID. */
  readonly suppliedRevisionId: string;
}

/**
 * Create part and file resources if they don't already exist.
 *
 * @param args - The {@link CreatePartFromFileArgs}.
 * @returns The {@link PartRevisionData}.
 */
export async function createPartFromFileIfNotExists({
  client,
  createFileReq,
  createPartReq,
  fileData,
  polling,
  verbose,
}: CreatePartFromFileArgs): Promise<PartRevisionData> {
  const file = await uploadFileIfNotExists({
    client,
    verbose,
    fileData,
    createFileReq,
  });
  const createPartRequest = createPartReq(file.id);
  const suppliedPartId = createPartRequest.data.attributes.suppliedId;
  const suppliedRevisionId =
    createPartRequest.data.attributes.suppliedRevisionId;

  if (suppliedPartId && suppliedRevisionId) {
    const existingPartRev = await getPartRevisionBySuppliedId({
      client,
      suppliedPartId,
      suppliedRevisionId,
      verbose,
    });
    if (existingPartRev) {
      if (verbose) {
        console.log(
          `part-revision with suppliedId '${suppliedPartId}' and suppliedRevisionId ` +
            `'${suppliedRevisionId}' already exists, using it, ${existingPartRev.id}`
        );
      }
      return existingPartRev;
    }
  }

  const createPartRes = await client.parts.createPart({ createPartRequest });
  const queuedId = createPartRes.data.data.id;
  if (verbose)
    console.log(
      `Created part with queued-translation ${queuedId}, file ${file.id}`
    );

  const part = await pollQueuedJob<Part>({
    id: queuedId,
    getQueuedJob: (id) =>
      client.translationInspections.getQueuedTranslation({ id }),
    polling,
  });
  const partRev = head(
    part.included?.filter(
      (pr) => pr.attributes.suppliedId === suppliedRevisionId
    )
  );
  if (!partRev)
    throw new Error(
      `Error creating part revision.\nRes: ${prettyJson(part.data)}`
    );

  if (verbose) console.log(`Created part-revision ${partRev.id}`);

  return partRev;
}

/**
 * Delete all parts.
 *
 * @param args - The {@link DeleteArgs}.
 */
export async function deleteAllParts({
  client,
  pageSize = 100,
  verbose = false,
}: DeleteArgs): Promise<void> {
  let cursor: string | undefined;
  do {
    const res = await getPage(() =>
      client.parts.getParts({ pageCursor: cursor, pageSize })
    );
    const ids = res.page.data.map((d) => d.id);
    cursor = res.cursor;
    await Promise.all(ids.map((id) => client.parts.deletePart({ id })));
    if (verbose) console.log(`Deleting part(s) ${ids.join(', ')}`);
  } while (cursor);
}

/**
 * Get a part revision by supplied ID.
 *
 * @param args - The {@link GetPartRevisionBySuppliedIdArgs}.
 * @returns The {@link PartRevisionData}.
 */
export async function getPartRevisionBySuppliedId({
  client,
  suppliedPartId,
  suppliedRevisionId,
}: GetPartRevisionBySuppliedIdArgs): Promise<PartRevisionData | undefined> {
  // TODO: Update once filtering by part and part-revision suppliedIds supported
  const existingPart = await getBySuppliedId<PartData, PartList>(
    () =>
      client.parts.getParts({
        pageSize: 1,
        filterSuppliedId: encodeIfNotEncoded(suppliedPartId),
      }),
    suppliedPartId
  );
  if (existingPart) {
    const existingPartRev = await getBySuppliedId<
      PartRevisionData,
      PartRevisionList
    >(
      () =>
        client.partRevisions.getPartRevisions({
          id: existingPart.id,
          pageSize: 1,
          filterSuppliedId: encodeIfNotEncoded(suppliedRevisionId),
        }),
      suppliedRevisionId
    );
    if (existingPartRev) return existingPartRev;
  }

  return undefined;
}

/**
 * Render a part revision.
 *
 * @param args - The {@link RenderImageArgs}.
 */
export async function renderPartRevision<T>({
  client,
  renderReq: { id, height, width },
}: RenderImageArgs): Promise<AxiosResponse<T>> {
  return await client.partRevisions.renderPartRevision(
    { id, height, width },
    { responseType: 'stream' }
  );
}
