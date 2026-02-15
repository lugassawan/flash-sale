import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { DataSource } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { ProductOrmEntity } from '@/infrastructure/persistence/postgresql/entities/product.orm-entity';
import { PurchaseOrmEntity } from '@/infrastructure/persistence/postgresql/entities/purchase.orm-entity';

let pgContainer: StartedPostgreSqlContainer;
let dataSource: DataSource;

export async function setupPostgresContainer(): Promise<{
  container: StartedPostgreSqlContainer;
  dataSource: DataSource;
}> {
  pgContainer = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('flashsale_test')
    .withUsername('test')
    .withPassword('test')
    .start();

  dataSource = new DataSource({
    type: 'postgres',
    host: pgContainer.getHost(),
    port: pgContainer.getMappedPort(5432),
    username: 'test',
    password: 'test',
    database: 'flashsale_test',
    entities: [ProductOrmEntity, PurchaseOrmEntity],
    synchronize: false,
  });

  await dataSource.initialize();

  const initSql = fs.readFileSync(
    path.join(__dirname, '../../../../../infrastructure/docker/postgresql/init.sql'),
    'utf-8',
  );
  await dataSource.query(initSql);

  return { container: pgContainer, dataSource };
}

export async function teardownPostgresContainer(): Promise<void> {
  if (dataSource?.isInitialized) {
    await dataSource.destroy();
  }
  if (pgContainer) {
    await pgContainer.stop();
  }
}

export async function cleanDatabase(ds: DataSource): Promise<void> {
  await ds.query('DELETE FROM purchases');
  await ds.query('DELETE FROM products');
}
