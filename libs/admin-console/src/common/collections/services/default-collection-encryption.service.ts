import {
  Observable,
  catchError,
  concatMap,
  distinctUntilChanged,
  map,
  of,
  switchMap,
  tap,
  throwError,
} from "rxjs";

import { Collection } from "@bitwarden/common/admin-console/models/collections/collection";
import { CollectionView } from "@bitwarden/common/admin-console/models/collections/collection.view";
import { FeatureFlag } from "@bitwarden/common/enums/feature-flag.enum";
import { ConfigService } from "@bitwarden/common/platform/abstractions/config/config.service";
import { LogService } from "@bitwarden/common/platform/abstractions/log.service";
import { SdkService } from "@bitwarden/common/platform/abstractions/sdk/sdk.service";
import { UserId } from "@bitwarden/common/types/guid";

import {
  CollectionDecryptionResult,
  CollectionEncryptionService,
} from "../abstractions/collection-encryption.service";

export class DefaultCollectionEncryptionService implements CollectionEncryptionService {
  constructor(
    private sdkService: SdkService,
    private logService: LogService,
    private configService: ConfigService,
  ) {}

  decrypt(collection: Collection, userId: UserId): Observable<CollectionView> {
    return this.decryptMany([collection], userId).pipe(
      map((views) => {
        if (views.length === 0) {
          const error = new Error(`Failed to decrypt collection ${collection.id}`);
          this.logService.error(`Failed to decrypt collection: ${error}`);
          throw error;
        }
        return views[0];
      }),
    );
  }

  decryptMany(collections: Collection[], userId: UserId): Observable<CollectionView[]> {
    return this.decryptManyWithFailures(collections, userId).pipe(map((result) => result.success));
  }

  decryptManyWithFailures(
    collections: Collection[],
    userId: UserId,
  ): Observable<CollectionDecryptionResult> {
    if (!collections || collections.length === 0) {
      return of({ success: [], failure: [] });
    }

    return this.configService.getFeatureFlag$(FeatureFlag.CollectionBulkDecryptWithFailures).pipe(
      distinctUntilChanged(),
      switchMap((bulkDecryptEnabled) =>
        bulkDecryptEnabled
          ? this.decryptManyWithFailuresV2(collections, userId)
          : this.decryptManyWithFailuresV1(collections, userId),
      ),
    );
  }

  /**
   * V1 implementation: decrypts each collection individually via the SDK, one at a time.
   * A collection that fails to decrypt is logged and returned in `failure` instead of aborting
   * the rest of the batch.
   */
  private decryptManyWithFailuresV1(
    collections: Collection[],
    userId: UserId,
  ): Observable<CollectionDecryptionResult> {
    const startTime = performance.now();

    return this.sdkService.userClient$(userId).pipe(
      concatMap(async (sdk) => {
        using ref = sdk.take();

        const success: CollectionView[] = [];
        const failure: Collection[] = [];
        for (const collection of collections) {
          try {
            const sdkView = ref.value.vault().collections().decrypt(collection.toSdkCollection());
            success.push(CollectionView.fromSdkCollectionView(sdkView, collection));
          } catch (error: unknown) {
            this.logService.error(`Failed to decrypt collection ${collection.id}: ${error}`);
            failure.push(collection);
          }
        }

        return { success, failure };
      }),
      catchError((error: unknown) => {
        this.logService.error(`Failed to decrypt collections in batch: ${error}`);
        return throwError(() => (error instanceof Error ? error : new Error(String(error))));
      }),
      tap((result) => {
        this.logService.measure(
          startTime,
          "Admin Console",
          "DefaultCollectionEncryptionService",
          "decryptManyWithFailures (v1, one at a time)",
          [
            ["Items", collections.length],
            ["Successes", result.success.length],
            ["Failures", result.failure.length],
          ],
        );
      }),
    );
  }

  /**
   * V2 implementation using the SDK's `decrypt_list` for batch performance. Falls back to
   * per-item decryption (V1 logic) when the batch call throws so that partially-corrupt
   * vaults still surface individual failures rather than aborting everything. Gated behind
   * {@link FeatureFlag.CollectionBulkDecryptWithFailures} until the SDK bindings have rolled
   * out everywhere this service is used.
   */
  private decryptManyWithFailuresV2(
    collections: Collection[],
    userId: UserId,
  ): Observable<CollectionDecryptionResult> {
    const startTime = performance.now();

    return this.sdkService.userClient$(userId).pipe(
      concatMap(async (sdk) => {
        using ref = sdk.take();

        const sdkCollections = collections.map((c) => c.toSdkCollection());
        const success: CollectionView[] = [];
        const failure: Collection[] = [];

        try {
          // Fast path: SDK decrypts the entire list in one call. Results are returned in
          // the same order as the input, so index-based re-association is safe.
          const sdkViews = ref.value.vault().collections().decrypt_list(sdkCollections);
          for (let i = 0; i < sdkViews.length; i++) {
            success.push(CollectionView.fromSdkCollectionView(sdkViews[i], collections[i]));
          }
        } catch {
          // Batch call failed (e.g. one key is missing); fall back to per-item so that
          // only the affected collections are reported as failures.
          for (const collection of collections) {
            try {
              const sdkView = ref.value.vault().collections().decrypt(collection.toSdkCollection());
              success.push(CollectionView.fromSdkCollectionView(sdkView, collection));
            } catch (error) {
              this.logService.error(`Failed to decrypt collection ${collection.id}: ${error}`);
              failure.push(collection);
            }
          }
        }

        return { success, failure };
      }),
      catchError((error: unknown) => {
        this.logService.error(`Failed to decrypt collections in batch: ${error}`);
        return throwError(() => (error instanceof Error ? error : new Error(String(error))));
      }),
      tap((result) => {
        this.logService.measure(
          startTime,
          "Admin Console",
          "DefaultCollectionEncryptionService",
          "decryptManyWithFailures (v2, decrypt_list with per-item fallback)",
          [
            ["Items", collections.length],
            ["Successes", result.success.length],
            ["Failures", result.failure.length],
          ],
        );
      }),
    );
  }
}
