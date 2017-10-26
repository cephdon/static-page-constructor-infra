#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const { lambdas } = require('../lambda');

const getProjectWideTags = () => [ { Key: 'Project', Value: 'Static Page Constructor' } ];

const getProjectWideTagsAsMap = () => {
	return {
		Project: 'Static Page Constructor'
	}
};

const _logsPolicyDocument = () => {
	return {
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
	};	
};

const getInitialCfnTemplate = () => {
	return Promise.resolve({
		AWSTemplateFormatVersion: '2010-09-09',
		Description: 'Static Page Constructor Stack',
		Parameters: {
			DomainName: {
				Type: 'String',
				Description: 'domain.tld'
			},
			OriginAccessIdentity: {
				Type: 'String',
				Default: 'E3ICJQOE52KJYP',
				Description: 'Origin Access Identity Id'
			},
		},
		Resources: {
		},
		Outputs: {
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
					PolicyName: 'AllowAccessToS3',
					PolicyDocument: {
						Version: '2012-10-17',
						Statement: [
							{
								Action: 's3:*',
								Effect: 'Allow',
								Resource: {
									'Fn::Join' : ['', ['arn:aws:s3:::', { 'Ref' : 'DefinitionsStore' },'/*']],
									'Fn::Join' : ['', ['arn:aws:s3:::', { 'Ref' : 'TargetSiteStore' },'/*']],
								}
							}
						]
					}
				},
				{
					PolicyName: 'LogsPolicy',
					PolicyDocument: _logsPolicyDocument()
				},
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
			Name: {'Fn::Join' : [' ',[ 'Static Page Constructor Api for', { 'Ref': 'DomainName' } ] ]},
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

const attachApiKey = (cfn) => {
	cfn.Resources.UsagePlan = {
		Type: 'AWS::ApiGateway::UsagePlan',
		Properties: {
			ApiStages: [
				{
					ApiId: {Ref: 'Api'},
					Stage: {Ref: 'ApiStage'}
				}
			],
			Description: 'Static Page Constructor Usage Plan'
		}
	};

	cfn.Resources.ApiKey = {
		Type: 'AWS::ApiGateway::ApiKey',
		DependsOn: ['ApiDeployment', 'ApiStage'],
		Description: 'Static Page Constructor API Key V1',
		Properties: {
			Enabled: true,
			StageKeys: [
				{
					RestApiId: { Ref: 'Api' },
					StageName: 'dev'
				}
			]
		}
	};

	cfn.Resources.UsagePlanKey = {
		Type: 'AWS::ApiGateway::UsagePlanKey',
		Properties: {
			KeyId: {Ref: 'ApiKey'},
			KeyType: 'API_KEY',
			UsagePlanId: {Ref: 'UsagePlan'}
		}
	}

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

const attachS3BucketPolicy = (cfn) => {
	const getPolicyDocumentStatements = (bucket) => {
		return [
			{
				Effect: 'Allow',
				Principal: '*',
				Action: 's3:GetObject',
				Resource: { 
					'Fn::Join' : [
						'', 
						[
							'arn:aws:s3:::', 
							{ 'Ref' : bucket }, 
							'/*'
						]
					]
				},
				//Condition:{
				//	StringLike:{
				//		'aws:Referer':[
				//			'http://www.example.com/*',
				//			'http://example.com/*'
				//		]
				//	}
				//}
			}
		];
	};

	cfn.Resources.DefinitionsStoreBucketPolicy = {
		Type: 'AWS::S3::BucketPolicy',
		Properties: {
			Bucket: { Ref: 'DefinitionsStore' },
			PolicyDocument: {
				Statement: getPolicyDocumentStatements('DefinitionsStore')
			}
		}
	};

	cfn.Resources.TargetSiteStoreBucketPolicy = {
		Type: 'AWS::S3::BucketPolicy',
		Properties: {
			Bucket: { Ref: 'TargetSiteStore' },
			PolicyDocument: {
				Statement: [
					...getPolicyDocumentStatements('TargetSiteStore'),
					{
						Effect: 'Allow',
						Principal: {
							AWS: {
								'Fn::Join' : ['', ['arn:aws:iam::cloudfront:user/CloudFront Origin Access Identity ', { Ref : 'OriginAccessIdentity' }]]
							}
						},
						Action: 's3:GetObject',
						Resource: { 
							'Fn::Join' : [
								'', 
								[
									'arn:aws:s3:::', 
									{ 'Ref' : 'TargetSiteStore' }, 
									'/*'
								]
							]
						}
					}
				]
			}
		}
	};

	cfn.Resources.CMSSiteStoreBucketPolicy = {
		Type: 'AWS::S3::BucketPolicy',
		Properties: {
			Bucket: { Ref: 'CMSSiteStore' },
			PolicyDocument: {
				Statement: getPolicyDocumentStatements('CMSSiteStore')
			}
		}
	};

	return Promise.resolve(cfn);
}

const attachDistribution = (cfn) => {
	const getDistributionConfig = (bucket) => {
		return {
			Aliases: [
				{ Ref: 'DomainName' }
			],
			Comment: `${getProjectWideTagsAsMap().Project} ${bucket} Distribution`,
			DefaultRootObject: 'index.html',
			HttpVersion: 'http2',
			Enabled: true,
			Origins: [
				{
					DomainName: {
						'Fn::GetAtt': [ bucket, 'DomainName' ]
					},
					Id: { 'Ref': bucket },
					S3OriginConfig: {
						OriginAccessIdentity: {
							'Fn::Join' : ['', ['origin-access-identity/cloudfront/', { Ref : 'OriginAccessIdentity' }]]
						}
					}
				}
			],

			PriceClass: 'PriceClass_100',
			DefaultCacheBehavior: {
				Compress: true,
				AllowedMethods: [
					'GET',
					'HEAD',
					'OPTIONS'
				],
				TargetOriginId: { 'Ref': bucket },
				ForwardedValues: {
					QueryString: 'false',
					Cookies: {
						Forward: 'none'
					}
				},
				ViewerProtocolPolicy: 'redirect-to-https'
			},
			CustomErrorResponses: [
				{
					ErrorCode: 404,
					ResponseCode: 200,
					ResponsePagePath: '/index.html'
				}
			]
		};
	};

	cfn.Resources.TargetSiteStoreDistribution = {
		Type: 'AWS::CloudFront::Distribution',
		Properties: {
			DistributionConfig: getDistributionConfig('TargetSiteStore')
		}
	};

	return Promise.resolve(cfn);
}

const attachS3Buckets = (cfn) => {
	const corsConfiguration = () => {
		return {
			CorsRules: [
				{
					AllowedHeaders: ['*'],
					AllowedMethods: ['GET', 'POST', 'PUT', 'DELETE'],
					AllowedOrigins: ['*'],
					ExposedHeaders: ['ETag'],
					MaxAge: 3000
				}
			]
		};
	};

	const websiteConfiguration = () => {
		return {
			IndexDocument: 'index.html',
			ErrorDocument: 'index.html'
		};
	};

	cfn.Resources.DefinitionsStore = {
		Type: 'AWS::S3::Bucket',
		Properties: {
			Tags: getProjectWideTags(),
			AccessControl: 'PublicRead',
			CorsConfiguration: corsConfiguration(),
			WebsiteConfiguration: websiteConfiguration(),
		}
	};

	cfn.Resources.TargetSiteStore = {
		Type: 'AWS::S3::Bucket',
		Properties: {
			Tags: getProjectWideTags(),
			AccessControl: 'PublicRead',
			CorsConfiguration: corsConfiguration(),
			WebsiteConfiguration: websiteConfiguration(),
		}
	};

	cfn.Resources.CMSSiteStore = {
		Type: 'AWS::S3::Bucket',
		Properties: {
			Tags: getProjectWideTags(),
			AccessControl: 'PublicRead',
			CorsConfiguration: corsConfiguration(),
			WebsiteConfiguration: websiteConfiguration(),
		}
	};

	return Promise.resolve(cfn);
};

const attachCognitoUserPool = (cfn) => {
	cfn.Resources.UserPool = {
		Type: 'AWS::Cognito::UserPool',
		Properties: {
			UserPoolName: {'Fn::Join' : [' ',[ 'Static Page Constructor UserPool for', { 'Ref': 'DomainName' } ] ]},
			AdminCreateUserConfig: {
				AllowAdminCreateUserOnly: true
			},
			AliasAttributes: ['email'],
			MfaConfiguration: 'OFF',
			UserPoolTags: getProjectWideTagsAsMap()
		}
	};

	return Promise.resolve(cfn);
};

const attachCognitoUserPoolClient = (cfn) => {
	cfn.Resources.UserPoolClient = {
		Type: 'AWS::Cognito::UserPoolClient',
		Properties: {
			GenerateSecret: false,
			UserPoolId: {
				Ref: 'UserPool'
			}
		}
	};

	return Promise.resolve(cfn);
};

const attachCognitoIdentityPool = (cfn) => {
	cfn.Resources.IdentityPool = {
		Type: 'AWS::Cognito::IdentityPool',
		Properties: {
			AllowUnauthenticatedIdentities: false,
			CognitoIdentityProviders: [
				{
					ClientId: {
						Ref: 'UserPoolClient'
					},
					ProviderName: {
						'Fn::GetAtt': ['UserPool', 'ProviderName']
					}
				}
			]
		}
	};

	return Promise.resolve(cfn);
};

const attachIdentityPoolRoleMapping = (cfn) => {
	cfn.Resources.IdentityPoolRoleMapping = {
		Type: 'AWS::Cognito::IdentityPoolRoleAttachment',
		Properties: {
			IdentityPoolId: {
				Ref: 'IdentityPool'
			},
			Roles: {
				authenticated: { 'Fn::GetAtt': ['CognitoAuthorizedRole', 'Arn'] },
				unauthenticated: { 'Fn::GetAtt': ['CognitoUnAuthorizedRole', 'Arn'] }
			}
		}
	};

	return Promise.resolve(cfn);
};

const attachCognitoRoles = (cfn) => {
	cfn.Resources.CognitoUnAuthorizedRole = {
		Type: 'AWS::IAM::Role',
		Properties: {
			AssumeRolePolicyDocument: {
				Version: '2012-10-17',
				Statement: [
					{
						Effect: 'Allow',
						Principal: { Federated: 'cognito-identity.amazonaws.com' },
						Action: ['sts:AssumeRoleWithWebIdentity'],
						Condition: {
							StringEquals: {
								'cognito-identity.amazonaws.com:aud': { Ref: 'IdentityPool' }
							},
							'ForAnyValue:StringLike': {
								'cognito-identity.amazonaws.com:amr': 'unauthenticated'
							} 
						}
					}
				]
			},
			Policies: []
		}
	};

	cfn.Resources.CognitoAuthorizedRole = {
		Type: 'AWS::IAM::Role',
		Properties: {
			AssumeRolePolicyDocument: {
				Version: '2012-10-17',
				Statement: [
					{
						Effect: 'Allow',
						Principal: { Federated: 'cognito-identity.amazonaws.com' },
						Action: ['sts:AssumeRoleWithWebIdentity'],
						Condition: {
							StringEquals: {
								'cognito-identity.amazonaws.com:aud': { Ref: 'IdentityPool' }
							},
							'ForAnyValue:StringLike': {
								'cognito-identity.amazonaws.com:amr': 'authenticated'
							} 
						}
					}
				]
			},
			Policies: [
				{
					PolicyName: 'LogsPolicy',
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
				},
				{
					PolicyName: 'InvokePolicy',
					PolicyDocument: {
						Version: '2012-10-17',
						Statement: [
							{
								Effect: 'Allow',
								Action: [
									'execute-api:GET',
									'execute-api:Invoke'
								],
								Resource: '*'
							}
						]
					}
				},
				{
					PolicyName: 'BucketsPolicy',
					PolicyDocument: {
						Version: '2012-10-17',
						Statement: [
							{
								Effect: 'Allow',
								Action: [
									's3:Put*',
									's3:ListBucket',
									's3:*MultipartUpload*'
								],
								Resource: [
									{'Fn::Join' : ['',[ 'arn:aws:s3:::', { 'Ref': 'DefinitionsStore' }, '/*' ] ]},
									{'Fn::Join' : ['',[ 'arn:aws:s3:::', { 'Ref': 'TargetSiteStore' }, '/*' ] ]},
									{'Fn::Join' : ['',[ 'arn:aws:s3:::', { 'Ref': 'CMSSiteStore' }, '/*' ] ]}
								]
							}
						]
					}
				}
			]
		}
	};

	return Promise.resolve(cfn);
}

const attachOutput = (cfn) => {
	cfn.Outputs.UserPoolId = {
		Value: { Ref: 'UserPool' },
		Export: { Name: 'UserPool::Id' }
	};

	cfn.Outputs.UserPoolClientId = {
		Value: { Ref: 'UserPoolClient' },
		Export: { Name: 'UserPoolClient::Id' }
	};

	cfn.Outputs.IdentityPoolId = {
		Value: { Ref: 'IdentityPool' },
		Export: { Name: 'IdentityPool::Id' }
	};

	cfn.Outputs.ApiKey = {
		Value: { Ref: 'ApiKey' },
		Export: { Name: 'ApiKey::Id' }
	}

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
	.then(attachApiKey)
	.then(attachDynamoTables)
	.then(attachS3BucketPolicy)
	.then(attachS3Buckets)
	.then(attachDistribution)
	.then(attachCognitoUserPool)
	.then(attachCognitoUserPoolClient)
	.then(attachCognitoIdentityPool)
	.then(attachCognitoRoles)
	.then(attachIdentityPoolRoleMapping)
	.then(attachOutput)
	.then(output);
