var AWS = require('aws-sdk');

var s3 = new AWS.S3();
var dynamodb = new AWS.DynamoDB();

exports.handler = (event, context, callback) => {
    const http404 = () => callback(null, {
        statusCode: 400,
        body: '',
        headers: {
            'Access-Control-Allow-Origin': '*'
        }
    });

    const http200 = (data) => callback(null, {
        statusCode: 200,
        body: JSON.stringify(data),
        headers: {
            'Access-Control-Allow-Origin': '*'
        }
    });

    const groupByKey = (enumerable, key) => {
        const ret = {};

        for (var i = enumerable.length - 1; i >= 0; i--) {
            ret[enumerable[i][key]] = enumerable[i];
        }

        return ret;
    };

    const doPage = ({name, slug, configuration}) => {
        return getWidgetsDefinitions(configuration.map(widgetconfig => widgetconfig.widget)).then(definitions => {
            return groupByKey(definitions, 'slug');
        }).then(definitions => {
            return configuration.map(conf => {
                return Object.assign(conf, {
                    def: definitions[conf.widget]
                });
            });
        }).then(configuration => {
            return getWidgetsHTMLs(configuration);
        }).then(configuration => {
            return getPageTemplate().then(mainPageTemplate => {
                return {
                    template: mainPageTemplate,
                    configuration: configuration
                };
            });
        }).then(context => {
            const out = [];
            const pageTemplate = context.template;

            context.configuration.forEach(widget => {
                let widgetTemplate = widget.def.html;

                Object.keys(widget.def.props).forEach(propName => {
                    widgetTemplate = widgetTemplate.replace(`{{ ${propName} }}`, widget.props[propName]);
                });

                out.push(widgetTemplate);
            });

            return pageTemplate.replace(
                `{{ renderWidgets }}`, 
                out.join('')
            );
        }).then(pageBody => {
            return new Promise((resolve, reject) => {
                s3.putObject({
                    Body: pageBody,
                    Bucket: 'bootstrap-marketing-site',
                    Key: `${slug}.html`,
                    ContentType: 'text/html'
                }, (err, data) => err ? reject() : resolve());
            });
        });
    };

    const getPageTemplate = () => {
        return new Promise((resolve, reject) => {
            s3.getObject({
                Bucket: 'awsstaticcms',
                Key: 'bootstrap-marketing-site/mainPageTemplate.html'
            }, (err, data) => {
                err ? reject(err) : resolve(data.Body.toString('utf-8'))
            });
        });     
    };

    const getWidgetsHTMLs = (configuration) => {
        return Promise.all(configuration.map(widgetconfig => {
            return new Promise((resolve, reject) => {
                s3.getObject({
                    Bucket: 'awsstaticcms',
                    Key: widgetconfig.def.html
                }, (err, data) => {
                    if (err) {
                        reject(err);
                    } else {
                        widgetconfig.def.html = data.Body.toString('utf-8');
                        resolve(widgetconfig);
                    }
                });
            });
        }));
    }

    const getWidgetsDefinitions = (slugs) => {
        slugs = [...new Set(slugs)];

        return new Promise((resolve, reject) => {
            dynamodb.batchGetItem({
                RequestItems: {
                    'static-cms-widgets': {
                        Keys: slugs.map(slug => {
                            return {
                                'slug': {
                                    S: slug
                                }
                            }
                        })
                    }
                }
            }, function(err, data) {
                if (err) {
                    reject(err);
                } else {
                    resolve(data.Responses['static-cms-widgets'].map(widget => {
                        return {
                            slug: widget.slug.S,
                            name: widget.name.S,
                            html: widget.html.S,
                            props: JSON.parse(widget.props.S),
                        };
                    }));
                }
            });
        });
    };

    if (event.queryStringParameters && event.queryStringParameters.slug) {
        const slug = event.queryStringParameters.slug;

        dynamodb.getItem({
            Key: {
                "slug": {
                    S: slug
                }
            }, 
            TableName: 'static-cms-pages'
        }, function(err, data) {
            if (err || !data.Item) {
                http404();
            } else {
                doPage({
                    name: data.Item.name.S,
                    slug: data.Item.slug.S,
                    configuration: JSON.parse(data.Item.configuration.S)
                }).then(() => {
                    http200({});
                });
            }
        });
    } else {
        http404();
    }
};