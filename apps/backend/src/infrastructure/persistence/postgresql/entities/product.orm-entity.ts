import { Entity, Column, PrimaryGeneratedColumn, OneToMany } from 'typeorm';
import { PurchaseOrmEntity } from './purchase.orm-entity';

@Entity('products')
export class ProductOrmEntity {
  @PrimaryGeneratedColumn('identity', { type: 'bigint', generatedIdentity: 'ALWAYS' })
  id!: string;

  @Column({ type: 'varchar', length: 64, unique: true })
  sku!: string;

  @Column({ name: 'product_name', type: 'varchar', length: 255 })
  productName!: string;

  @Column({ name: 'initial_stock', type: 'int' })
  initialStock!: number;

  @Column({ name: 'start_time', type: 'timestamptz' })
  startTime!: Date;

  @Column({ name: 'end_time', type: 'timestamptz' })
  endTime!: Date;

  @Column({ type: 'varchar', length: 20, default: 'UPCOMING' })
  state!: string;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'NOW()' })
  createdAt!: Date;

  @Column({ name: 'created_by', type: 'varchar', length: 255 })
  createdBy!: string;

  @Column({ name: 'updated_at', type: 'timestamptz', nullable: true })
  updatedAt!: Date | null;

  @Column({ name: 'updated_by', type: 'varchar', length: 255, nullable: true })
  updatedBy!: string | null;

  @OneToMany(() => PurchaseOrmEntity, (purchase) => purchase.product)
  purchases!: PurchaseOrmEntity[];
}
