import { Router } from 'express';

import { authRouter } from './auth.routes';
import { bookingRouter } from './booking.routes';
import { healthRouter } from './health.routes';
import { membershipRouter } from './membership.routes';
import { partyPackageRouter } from './party-package.routes';
import { contentRouter } from './content.routes';
import { eventRouter } from './event.routes';
import { ticketRouter } from './ticket.routes';
import { userRouter } from './user.routes';
import { waiverRouter } from './waiver.routes';
import { waiverAuthRouter } from './waiver-auth.routes';
import { adminRouter } from './admin.routes';
import { checkoutRouter } from './checkout.routes';
import { squareRouter } from './square.routes';
import { pricingRouter } from './pricing.routes';

export const apiRouter = Router();

apiRouter.use('/health', healthRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use('/users', userRouter);
apiRouter.use('/bookings', bookingRouter);
apiRouter.use('/party-packages', partyPackageRouter);
apiRouter.use('/memberships', membershipRouter);
apiRouter.use('/waivers', waiverRouter);
apiRouter.use('/waiver-auth', waiverAuthRouter);
apiRouter.use('/events', eventRouter);
apiRouter.use('/tickets', ticketRouter);
apiRouter.use('/content', contentRouter);
apiRouter.use('/admin', adminRouter);
apiRouter.use('/checkout', checkoutRouter);
apiRouter.use('/square', squareRouter);
apiRouter.use('/pricing', pricingRouter);
