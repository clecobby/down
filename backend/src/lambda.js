// AWS Lambda entry point: the same Express app, behind a Lambda Function URL that only CloudFront may call.
import serverlessExpress from '@codegenie/serverless-express';
import { app } from './server.js';

const express = serverlessExpress({ app, binarySettings: { contentTypes: ['multipart/form-data', 'image/*'] } });

export const handler = async (event, context) => {
  // CloudFront adds this secret header; direct calls to the function URL are refused.
  const headers = event.headers || {};
  if (process.env.ORIGIN_SECRET && headers['x-origin-secret'] !== process.env.ORIGIN_SECRET) {
    return { statusCode: 403, body: 'Forbidden' };
  }
  return express(event, context);
};
