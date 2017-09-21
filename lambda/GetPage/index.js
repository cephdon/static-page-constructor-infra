var AWS = require('aws-sdk');
var dynamodb = new AWS.DynamoDB();

exports.handler = (event, context, callback) => {
    if (event.queryStringParameters && event.queryStringParameters.slug) {
        const slug = event.queryStringParameters.slug;

        const params = {
            Key: {
                "slug": {
                    S: slug
                }
            }, 
            TableName: process.env.PAGES_TABLE_NAME
        };

        dynamodb.getItem(params, function(err, data) {
            if (err || !data.Item) {
                callback(null, {
                    statusCode: 404,
                    body: '',
                    headers: {
                        'Access-Control-Allow-Origin': '*'
                    }
                });
            } else {
                const page = data.Item;

                callback(null, {
                    statusCode: 200,
                    body: JSON.stringify({
                        name: page.name.S,
                        slug: page.slug.S,
                        template: page.template ? page.template.S : 'main',
                        configuration: JSON.parse(page.configuration.S),
                        props: page.props ? JSON.parse(page.props.S) : {}
                    }),
                    headers: {
                        'Access-Control-Allow-Origin': '*'
                    }
                });
            }
        });
    } else {
        callback(null, {
            statusCode: 400,
            body: '',
            headers: {
                'Access-Control-Allow-Origin': '*'
            }
        });
    }
};