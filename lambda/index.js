const fs = require('fs');
const path = require('path');

const getPath = (...files) => path.join(__dirname, ...files);

const enumerateLambdas = () => {
	return fs.readdirSync(getPath())
		.filter(file => {
			return fs.lstatSync(getPath(file)).isDirectory();
		})
		.map(dir => {
			const package = fs.readFileSync(getPath(dir, 'package.json'), 'utf8').toString();
			const packageJson = JSON.parse(package);

			return {
				name: packageJson.name,
				version: packageJson.version,
				description: packageJson.description,
				dir: path.resolve(getPath(dir))
			};
		});
}

module.exports.lambdas = enumerateLambdas();