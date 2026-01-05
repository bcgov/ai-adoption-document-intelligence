# Integration Tests

This folder contains integration tests for the NestJs backend service.

These tests are designed to test the API and the database together.

They can be run with the command `npm run test:int`, which starts the `run.sh` script.

For this series of tests, an ephemeral database is created. It is then destroyed after testing.
You may need to seed this database for your tests. That can be done within a test file.

Authentication is mocked for these tests, as accessing the BCGOV SSO is not feasible. Use the `TestAppModule` class instead of the standard app module.

Examples can be found in the file `sample-test.spec.ts`.
