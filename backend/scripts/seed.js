"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const faker_1 = require("@faker-js/faker");
const database_1 = require("../src/config/database");
const models_1 = require("../src/models");
const password_1 = require("../src/utils/password");
async function seed() {
    await (0, database_1.connectDatabase)();
    console.info('Seeding database...');
    await models_1.BookingModel.deleteMany({});
    await models_1.ChildModel.deleteMany({});
    await models_1.PartyPackageModel.deleteMany({});
    await models_1.UserModel.deleteMany({});
    const passwordHash = await (0, password_1.hashPassword)('playfunia123');
    const guardian = await models_1.UserModel.create({
        firstName: 'Avery',
        lastName: 'Gardner',
        email: 'guardian@example.com',
        passwordHash,
        phone: faker_1.faker.phone.number('+1-###-###-####'),
        address: {
            line1: '123 Playground Ave',
            city: 'Funville',
            state: 'CA',
            postalCode: '90001',
        },
    });
    const children = await models_1.ChildModel.create([
        {
            firstName: 'Milo',
            lastName: 'Gardner',
            birthDate: faker_1.faker.date.birthdate({ min: 4, max: 8, mode: 'age' }),
            guardian: guardian._id,
            membershipTier: 'silver',
        },
        {
            firstName: 'Luna',
            lastName: 'Gardner',
            birthDate: faker_1.faker.date.birthdate({ min: 2, max: 6, mode: 'age' }),
            guardian: guardian._id,
            membershipTier: 'standard',
        },
    ]);
    guardian.children = children.map(child => child._id);
    await guardian.save();
    const partyPackages = await models_1.PartyPackageModel.create([
        {
            name: 'Playful Pals',
            description: '90 minutes of play with a hosted party room.',
            durationMinutes: 90,
            basePrice: 249,
            maxGuests: 15,
        },
        {
            name: 'Adventure Squad',
            description: '2-hour adventure including themed decorations and pizza.',
            durationMinutes: 120,
            basePrice: 349,
            maxGuests: 20,
        },
        {
            name: 'Ultimate Fun Fest',
            description: '3-hour private play session with premium add-ons.',
            durationMinutes: 180,
            basePrice: 499,
            maxGuests: 30,
        },
    ]);
    const upcomingDate = faker_1.faker.date.soon({ days: 30 });
    upcomingDate.setHours(10, 0, 0, 0);
    await models_1.BookingModel.create({
        reference: `SEED-${Date.now()}`,
        guardian: guardian._id,
        children: children.map(child => child._id),
        partyPackage: partyPackages[0]._id,
        eventDate: upcomingDate,
        startTime: '10:00',
        endTime: '12:00',
        guests: 12,
        notes: 'Allergy-friendly snacks only.',
        status: 'confirmed',
    });
    console.info('Seed data created successfully.');
}
seed()
    .then(() => {
    console.info('Seeding complete. You can log in with guardian@example.com / playfunia123');
    process.exit(0);
})
    .catch(error => {
    console.error('Seeding failed', error);
    process.exit(1);
});
//# sourceMappingURL=seed.js.map