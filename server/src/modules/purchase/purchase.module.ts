import { Module } from '@nestjs/common'
import { InventoryModule } from '../inventory/inventory.module'
import { PurchaseController } from './purchase.controller'
import { PurchaseService } from './purchase.service'

@Module({
  imports: [InventoryModule],
  controllers: [PurchaseController],
  providers: [PurchaseService],
  exports: [PurchaseService],
})
export class PurchaseModule {}
