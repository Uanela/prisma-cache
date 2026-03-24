jest.mock(
  "@prisma/client",
  () => ({
    Prisma: {
      dmmf: {
        datamodel: {
          models: [], // Add mock models here if your RelationGraph needs them
        },
      },
    },
  }),
  { virtual: true }
);
