import { Module } from '@nestjs/common';
import { PaymentController } from './payment.controller';
import { PaymentService } from './payment.service';
import { CashfreeService } from './cashfree.service';
import { FirebaseModule } from '../firebase/firebase.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [FirebaseModule, AuthModule],
  controllers: [PaymentController],
  providers: [PaymentService, CashfreeService],
  exports: [PaymentService, CashfreeService],
})
export class PaymentModule {}
