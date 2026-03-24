import { ModuleMetadata } from '@nestjs/common';
import { AppModule } from '../../src/app.module';

export function createIntegrationTestingModuleMetadata(): ModuleMetadata {
  return {
    imports: [AppModule],
  };
}

export function createE2eTestingModuleMetadata(): ModuleMetadata {
  return {
    imports: [AppModule],
  };
}
