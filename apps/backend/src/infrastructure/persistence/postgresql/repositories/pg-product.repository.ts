import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProductOrmEntity } from '../entities/product.orm-entity';

@Injectable()
export class PgProductRepository {
  private readonly logger = new Logger(PgProductRepository.name);

  constructor(
    @InjectRepository(ProductOrmEntity)
    private readonly repo: Repository<ProductOrmEntity>,
  ) {}

  async findBySku(sku: string): Promise<ProductOrmEntity | null> {
    return this.repo.findOne({ where: { sku } });
  }

  async save(entity: Partial<ProductOrmEntity>): Promise<ProductOrmEntity> {
    const product = this.repo.create(entity);
    const saved = await this.repo.save(product);
    this.logger.log(`Product saved: sku=${saved.sku}`);
    return saved;
  }

  async upsertBySku(entity: Partial<ProductOrmEntity>): Promise<void> {
    await this.repo.upsert(entity, ['sku']);
    this.logger.log(`Product upserted: sku=${entity.sku}`);
  }

  async deleteBySku(sku: string): Promise<void> {
    await this.repo.delete({ sku });
    this.logger.log(`Product deleted: sku=${sku}`);
  }
}
