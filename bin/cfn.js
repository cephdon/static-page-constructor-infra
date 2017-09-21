#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const { lambdas } = require('../lambda');

const getProjectWideTags = () => [ { Key: 'Project', Value: 'Static Page Constructor' } ];

const getInitialCfnTemplate = () => {
	return Promise.resolve({
		AWSTemplateFormatVersion: '2010-09-09',
		Description: 'Static Page Constructor Stack',
		Parameters: {
		},
		Resources: {
		}
	});
};

const attachLambdaExecutionRole = (cfn) => {
	cfn.Resources.LambdaExecutionRole = {
		Type: 'AWS::IAM::Role',
		Properties: {
			AssumeRolePolicyDocument: {
				Version: '2012-10-17',
				Statement: [
					{
						Effect: 'Allow',
						Principal: { Service: ['lambda.amazonaws.com'] },
						Action: ['sts:AssumeRole']
					}
				]
			},
			Policies: [
				{
					PolicyName: 'AllowAccessToPageTemplatesDynamoDBTable',
					PolicyDocument: {
						Version: '2012-10-17',
						Statement: [
							{
								Action: 'dynamodb:*',
								Effect: 'Allow',
								Resource: {
									'Fn::GetAtt': ['PageTemplates', 'Arn']
								}
							}
						]
					}
				},
				{
					PolicyName: 'AllowAccessToPagesDynamoDBTable',
						PolicyDocument: {
						Version: '2012-10-17',
						Statement: [
							{
								Action: 'dynamodb:*',
								Effect: 'Allow',
								Resource: {
									'Fn::GetAtt': ['Pages', 'Arn']
								}
							}
						]
					}
				},
				{
					PolicyName: 'AllowAccessToWidgetsDynamoDBTable',
					PolicyDocument: {
						Version: '2012-10-17',
						Statement: [
							{
								Action: 'dynamodb:*',
								Effect: 'Allow',
								Resource: {
									'Fn::GetAtt': ['Widgets', 'Arn']
								}
							}
						]
					}
				},
				{
					PolicyName: 'AllowAccessToDefinitionsStore',
					PolicyDocument: {
						Version: '2012-10-17',
						Statement: [
							{
								Action: 's3:*',
								Effect: 'Allow',
								Resource: {
									'Fn::GetAtt': ['DefinitionsStore', 'Arn']
								}
							}
						]
					}
				},
				{
					PolicyName: 'AllowAccessToTargetSiteStore',
					PolicyDocument: {
						Version: '2012-10-17',
						Statement: [
							{
								Action: 's3:*',
								Effect: 'Allow',
								Resource: {
									'Fn::GetAtt': ['TargetSiteStore', 'Arn']
								}
							}
						]
					}
				}
			]
		}
	}

	return Promise.resolve(cfn);
}

const attachInvokePermission = (cfn) => {
	lambdas.reduce((cfn, lambda) => {
		cfn.Resources[`${lambda.name}InvokePermission`] = {
			Type: 'AWS::Lambda::Permission',
			Properties: {
				FunctionName: { 'Fn::GetAtt': [`${lambda.name}`, 'Arn'] },
				Action: 'lambda:InvokeFunction',
				Principal: 'apigateway.amazonaws.com',
				SourceArn: {
					'Fn::Join': [
						'', 
						[
							'arn:aws:execute-api:', 
							{'Ref': 'AWS::Region'}, 
							':', 
							{'Ref': 'AWS::AccountId'}, 
							':', 
							{'Ref': 'Api'}, 
							'/*'
						]
					]
				}
			}
		};

		return cfn;
	}, cfn);

	return Promise.resolve(cfn);
};

const attachLambdas = (cfn) => {
	lambdas.reduce((cfn, lambda) => {
		cfn.Resources[`${lambda.name}`] = {
			Type: 'AWS::Lambda::Function',
			DependsOn: ['PageTemplates', 'Pages', 'Widgets', 'DefinitionsStore', 'TargetSiteStore'],
			Properties: {
				Runtime: 'nodejs6.10',
				Handler: 'index.handler',
				Role: { 'Fn::GetAtt': ['LambdaExecutionRole', 'Arn'] },
				Code: {
					S3Bucket: 'static-page-constructor',
					S3Key: `lambdas/${lambda.name}@${lambda.version}.zip`
				},
				Tags: getProjectWideTags(),
				Environment: {
					Variables: {
						PAGE_TEMPLATES_TABLE_NAME: { Ref: 'PageTemplates' },
						PAGES_TABLE_NAME: { Ref: 'Pages' },
						WIDGETS_TABLE_NAME: { Ref: 'Widgets' },
						DEFINITIONS_BUCKET: { Ref: 'DefinitionsStore' },
						TARGET_SITE_BUCKET: { Ref: 'TargetSiteStore' }
					}
				}
			}
		};
		return cfn;
	}, cfn);

	return Promise.resolve(cfn);
};

const attachApi = (cfn) => {
	cfn.Resources.Api = {
		Type: 'AWS::ApiGateway::RestApi',
		Properties: {
			Name: 'Static Page Constructor Api',
			Description: 'Api used by Static Page Constructor CMS',
			FailOnWarnings: true
		}
	}

	return Promise.resolve(cfn);
};

const attachApiStage = (cfn) => {
	cfn.Resources.ApiStage = {
		Type: 'AWS::ApiGateway::Stage',
		DependsOn : ['ApiAccount'],
		Properties: {
			DeploymentId: { Ref: 'ApiDeployment' },
			MethodSettings: [
				{
					DataTraceEnabled: true,
					HttpMethod: '*',
					LoggingLevel: 'INFO',
					ResourcePath: '/*'
				}
			],
			RestApiId: { Ref: 'Api' },
			StageName: 'dev'
		}
	}

	return Promise.resolve(cfn);
};

const attachApiDeployment = (cfn) => {
	cfn.Resources.ApiDeployment = {
		Type: 'AWS::ApiGateway::Deployment',
		DependsOn: lambdas.map(lambda => `${lambda.name}Method`),
		Properties: {
			RestApiId: { Ref: 'Api' },
			StageName: 'DummyStage'
		}
	}

	return Promise.resolve(cfn);
};

const attachApiLogRole = (cfn) => {
	cfn.Resources.ApiCloudWatchLogsRole = {
		Type: 'AWS::IAM::Role',
		Properties: {
			AssumeRolePolicyDocument: {
				Version: '2012-10-17',
				Statement: [
					{
						Effect: 'Allow',
						Principal: {  Service: ['apigateway.amazonaws.com'] },
						Action: ['sts:AssumeRole']
					}
				]
			},
			Policies: [{
				PolicyName: 'ApiGatewayLogsPolicy',
				PolicyDocument: {
					Version: '2012-10-17',
					Statement: [
						{
							Effect: 'Allow',
							Action: [
								'logs:CreateLogGroup',
								'logs:CreateLogStream',
								'logs:DescribeLogGroups',
								'logs:DescribeLogStreams',
								'logs:PutLogEvents',
								'logs:GetLogEvents',
								'logs:FilterLogEvents'
							],
							Resource: '*'
						}
					]
				}
			}]
		}
	}

	return Promise.resolve(cfn);
};

const appachApiAccount = (cfn) => {
	cfn.Resources.ApiAccount = {
		Type: 'AWS::ApiGateway::Account',
		Properties: {
			CloudWatchRoleArn: { 'Fn::GetAtt': ['ApiCloudWatchLogsRole', 'Arn'] }
		}
	}

	return Promise.resolve(cfn);
}

const attachApiResources = (cfn) => {
	lambdas.reduce((cfn, lambda) => {
		cfn.Resources[`${lambda.name}Resource`] = {
			Type: 'AWS::ApiGateway::Resource',
			Properties: {
				RestApiId: { Ref: 'Api' },
				ParentId: { 'Fn::GetAtt': ['Api', 'RootResourceId'] },
				PathPart: lambda.name
			}
		};
		return cfn;
	}, cfn);

	return Promise.resolve(cfn);
};

const attachApiMethods = (cfn) => {
	lambdas.reduce((cfn, lambda) => {
		cfn.Resources[`${lambda.name}Method`] = {
			Type: 'AWS::ApiGateway::Method',
			DependsOn: [`${lambda.name}InvokePermission`],
			Properties: {
				ApiKeyRequired: true,
				AuthorizationType: 'NONE',
				HttpMethod: 'ANY',
				Integration: {
					Type: 'AWS_PROXY',
					IntegrationHttpMethod: 'POST',
					IntegrationResponses: [{
						StatusCode: 200
					}],
					Uri: {
						'Fn::Join' : [
							'', 
							[
								'arn:aws:apigateway:', 
								{ Ref: 'AWS::Region' },
								':lambda:path/2015-03-31/functions/', 
								{
									'Fn::GetAtt': [lambda.name, 'Arn']
								}, 
								'/invocations'
							]
						]
					}
				},
				ResourceId: { Ref: `${lambda.name}Resource` },
				RestApiId: { Ref: 'Api' },
				MethodResponses: [{
					StatusCode: 200
				}]
			}
		};
		return cfn;
	}, cfn);

	return Promise.resolve(cfn);
};

const enableApiCors = (cfn) => {
	lambdas.reduce((cfn, lambda) => {
		cfn.Resources[`${lambda.name}OptionsMethod`] = {
			Type: 'AWS::ApiGateway::Method',
			Properties: {
				AuthorizationType: 'NONE',
				HttpMethod: 'OPTIONS',
				Integration: {
					Type: 'MOCK',
					IntegrationResponses: [{
						ResponseParameters: {
							'method.response.header.Access-Control-Allow-Headers': "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'",
							'method.response.header.Access-Control-Allow-Methods': "'GET,POST,OPTIONS'",
							'method.response.header.Access-Control-Allow-Origin': "'*'"
						},
						ResponseTemplates: {
							'application/json': ''
						},
						StatusCode: 200
					}],
					PassthroughBehavior: 'NEVER',
					RequestTemplates: {
						'application/json': '{\'statusCode\': 200}'
					}
				},
				MethodResponses	: [{
					ResponseModels: {
						'application/json': 'Empty'
					},
					ResponseParameters: {
						'method.response.header.Access-Control-Allow-Headers': true,
						'method.response.header.Access-Control-Allow-Methods': true,
						'method.response.header.Access-Control-Allow-Origin': true
					},
					StatusCode: 200
				}],
				ResourceId: { Ref: `${lambda.name}Resource` },
				RestApiId: { Ref: 'Api' },
			}
		};
		return cfn;
	}, cfn);

	return Promise.resolve(cfn);
};

const attachDynamoTables = (cfn) => {
	cfn.Resources[`PageTemplates`] = {
		Type: 'AWS::DynamoDB::Table',
		Properties: {
			AttributeDefinitions: [
				{
					AttributeName: 'slug',
					AttributeType: 'S'
				},
			],
			KeySchema: [
				{
					AttributeName: 'slug',
					KeyType: 'HASH'
				}
			],
			ProvisionedThroughput: {
				WriteCapacityUnits: 5,
				ReadCapacityUnits: 5
			}
		}
	};

	cfn.Resources[`Pages`] = {
		Type: 'AWS::DynamoDB::Table',
		Properties: {
			AttributeDefinitions: [
				{
					AttributeName: 'slug',
					AttributeType: 'S'
				}
			],
			KeySchema: [
				{
					AttributeName: 'slug',
					KeyType: 'HASH'
				}
			],
			ProvisionedThroughput: {
				WriteCapacityUnits: 5,
				ReadCapacityUnits: 5
			}
		}
	};

	cfn.Resources[`Widgets`] = {
		Type: 'AWS::DynamoDB::Table',
		Properties: {
			AttributeDefinitions: [
				{
					AttributeName: 'slug',
					AttributeType: 'S'
				}
			],
			KeySchema: [
				{
					AttributeName: 'slug',
					KeyType: 'HASH'
				}
			],
			ProvisionedThroughput: {
				WriteCapacityUnits: 5,
				ReadCapacityUnits: 5
			}
		}
	};

	return Promise.resolve(cfn);
}

const attachS3Buckets = (cfn) => {
	cfn.Resources[`DefinitionsStore`] = {
		Type: 'AWS::S3::Bucket',
		Properties: {
			Tags: getProjectWideTags()
		}
	};

	cfn.Resources[`TargetSiteStore`] = {
		Type: 'AWS::S3::Bucket',
		Properties: {
			Tags: getProjectWideTags()
		}
	};

	return Promise.resolve(cfn);	
};

const output = (cfn) => {
	fs.writeFileSync(
		path.join(__dirname, '../static-page-constructor.json'), 
		JSON.stringify(cfn, null, 2), 
		'utf-8'
	);
};

getInitialCfnTemplate()
	.then(attachLambdaExecutionRole)
	.then(attachLambdas)
	.then(attachInvokePermission)
	.then(attachApi)
	.then(attachApiDeployment)
	.then(attachApiStage)
	.then(attachApiLogRole)
	.then(appachApiAccount)
	.then(attachApiResources)
	.then(attachApiMethods)
	.then(enableApiCors)
	.then(attachDynamoTables)
	.then(attachS3Buckets)
	.then(output);
