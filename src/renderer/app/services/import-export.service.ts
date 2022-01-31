import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Export, HighestMigrationId } from '@mockoon/commons';
import { EMPTY, from, Observable } from 'rxjs';
import { concatMap, filter, map, switchMap, tap } from 'rxjs/operators';
import { Logger } from 'src/renderer/app/classes/logger';
import { MainAPI } from 'src/renderer/app/constants/common.constants';
import { DataService } from 'src/renderer/app/services/data.service';
import { DialogsService } from 'src/renderer/app/services/dialogs.service';
import { EnvironmentsService } from 'src/renderer/app/services/environments.service';
import { OpenAPIConverterService } from 'src/renderer/app/services/openapi-converter.service';
import { ToastsService } from 'src/renderer/app/services/toasts.service';
import { Store } from 'src/renderer/app/stores/store';

@Injectable({ providedIn: 'root' })
export class ImportExportService extends Logger {
  private logger = new Logger('[SERVICE][IMPORT-EXPORT]');

  constructor(
    protected toastService: ToastsService,
    private store: Store,
    private dataService: DataService,
    private openAPIConverterService: OpenAPIConverterService,
    private dialogsService: DialogsService,
    private environmentsService: EnvironmentsService,
    private http: HttpClient
  ) {
    super('[SERVICE][IMPORT-EXPORT]', toastService);
  }

  /**
   * Load data from an URL (used for custom protocol)
   *
   * @param url
   * @returns
   */
  public importFromUrl(url: string): Observable<[string, string]> {
    this.logger.info(`Importing from URL: ${url}`);

    return this.http.get(url, { responseType: 'text' }).pipe(
      map<string, Export>((data) => JSON.parse(data)),
      switchMap((data) => this.import(data))
    );
  }

  /**
   * Import an OpenAPI (v2/v3) file in Mockoon's format.
   * Append imported envs to the env array.
   */
  public async importOpenAPIFile() {
    const filePath = await this.dialogsService.showOpenDialog(
      'Import OpenAPI specification file',
      'openapi'
    );

    this.logMessage('info', 'OPENAPI_IMPORT', {
      filePath
    });

    if (filePath) {
      try {
        const environment = await this.openAPIConverterService.import(filePath);
        if (environment) {
          this.environmentsService
            .addEnvironment(environment)
            .pipe(
              tap(() => {
                this.logMessage('info', 'OPENAPI_IMPORT_SUCCESS', {
                  environmentName: environment.name
                });
              })
            )
            .subscribe();
        }
      } catch (error) {
        this.logMessage('error', 'OPENAPI_IMPORT_ERROR', {
          error,
          filePath
        });
      }
    }
  }

  /**
   * Export all environments to an OpenAPI v3 file
   */
  public async exportOpenAPIFile() {
    const activeEnvironment = this.store.getActiveEnvironment();

    if (!activeEnvironment) {
      return;
    }

    this.logMessage('info', 'OPENAPI_EXPORT', {
      environmentUUID: activeEnvironment.uuid
    });

    const filePath = await this.dialogsService.showSaveDialog(
      'Export environment to OpenAPI JSON'
    );

    // dialog not cancelled
    if (filePath) {
      try {
        await MainAPI.invoke(
          'APP_WRITE_FILE',
          filePath,
          await this.openAPIConverterService.convertToOpenAPIV3(
            activeEnvironment
          )
        );

        this.logMessage('info', 'OPENAPI_EXPORT_SUCCESS', {
          environmentName: activeEnvironment.name
        });
      } catch (error) {
        this.logMessage('error', 'OPENAPI_EXPORT_ERROR', {
          error,
          environmentUUID: activeEnvironment.uuid
        });
      }
    }
  }

  /**
   * Import and migrate data
   * Routes are not migrated, and a version check is done before importing
   *
   * @param importedData
   */
  private import(importedData: Export) {
    // TODO remove/migrate/reuse for backward compatiblity

    // return if imported data are empty or source property is not present
    if (!this.dataService.isExportData(importedData)) {
      return EMPTY;
    }

    return from(importedData.data).pipe(
      filter((data) => {
        if (
          data.type === 'environment' &&
          data.item.lastMigration > HighestMigrationId
        ) {
          // environment is too recent
          this.logMessage('error', 'ENVIRONMENT_MORE_RECENT_VERSION', {
            name: data.item.name,
            uuid: data.item.uuid
          });

          return false;
        }

        return true;
      }),
      concatMap((data) => {
        if (data.type === 'environment') {
          const migratedEnvironment =
            this.dataService.migrateAndValidateEnvironment(data.item);

          return this.environmentsService.addEnvironment(migratedEnvironment);
        }

        return EMPTY;
      })
    );
  }
}
