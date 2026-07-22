import { Module } from '@nestjs/common';
import { InventoryController } from './inventory.controller';
import { InventoryPostingService } from './inventory-posting.service';
import { InventoryService } from './inventory.service';

@Module({
  controllers: [InventoryController],
  providers: [InventoryService, InventoryPostingService],
  exports: [InventoryService, InventoryPostingService],
})
export class InventoryModule {}
