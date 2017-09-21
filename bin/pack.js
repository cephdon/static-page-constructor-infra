#!/usr/bin/env node

const { exec } = require('child_process');
const s3 = require('s3');
const tempy = require('tempy');
const rimraf = require('rimraf');
const path = require('path');

const { lambdas } = require('../lambda');

lambdas.forEach(lambda => {
	lambda.zip = `${lambda.name}@${lambda.version}.zip`
});

const workdir = tempy.directory();

const cleanUp = () => rimraf(workdir, () => console.log('Clean up done.'));

const promises = lambdas.map(lambda => {
	return new Promise((resolve, reject) => {
		exec(`zip -qr ${lambda.zip} * && cp ${lambda.zip} ${workdir}`, { cwd: lambda.dir }, (err) => {
			err ? reject(err) : resolve(lambda);
		});
	});
});

Promise.all(promises).then(values => {
	const s3Client = s3.createClient({
		s3Options: {
			region: 'eu-west-1',
			sslEnabled: true,
		}
	});

	const uploading = new Promise((resolve, reject) => {
		var uploader = s3Client.uploadDir({
			localDir: workdir,
			deleteRemoved: true,
			s3Params: {
				Bucket: 'static-page-constructor',
				Prefix: `lambdas/`,
			}
		});

		uploader.on('error', function(err) {
			cleanUp();
			reject();
		});

		uploader.on('end', function() {
			cleanUp();
			resolve();
		});
	}).then(() => {
		rimraf(path.join(__dirname, '../lambda/**/*.zip'), () => {});
	});
});