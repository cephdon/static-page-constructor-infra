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

    const doPage = ({name, slug, configuration, template, props}) => {
        return getWidgetsDefinitionsWithHTML(configuration).then(definitions => {

            const getDefForConf = c => definitions.find(d => d.slug === c.widget);

            const renderWidgets = (configuration) => {
                const out = [];

                configuration.forEach(widget => {
                    out.push(renderWidget(widget));
                });

                return out.join('');
            };

            const renderWidget = (conf) => {
                let def = getDefForConf(conf);
                let html = def.html;

                Object.keys(def.props).forEach(propName => {
                    html = html.replace(`{{ ${propName} }}`, conf.props[propName]);
                });

                if (conf.areas) {
                    Object.keys(conf.areas).forEach(key => {
                        html = html.replace(`{{ renderWidgets.${key} }}`, renderWidgets(conf.areas[key]));
                    });
                }

                return html;
            };

            return getPageTemplate({template}).then(body => {
                body = body.replace(
                    `{{ renderWidgets }}`,
                    renderWidgets(configuration)
                );

                Object.keys(props).forEach(key => {
                    body = body.replace(
                        `{{ page.${key} }}`,
                        props[key]
                    );
                });

                return savePage({slug, body});

            });

        });
    };

    const savePage = ({slug, body}) => {
        return new Promise((resolve, reject) => {
            s3.putObject({
                Body: body,
                Bucket: 'bootstrap-marketing-site',
                Key: `${slug}/index.html`,
                ContentType: 'text/html'
            }, (err, data) => err ? reject() : resolve());
        });
    };

    const getPageTemplate = ({template}) => {
        return new Promise((resolve, reject) => {
            s3.getObject({
                Bucket: 'awsstaticcms',
                Key: `bootstrap-marketing-site/${template}PageTemplate.html`
            }, (err, data) => {
                err ? reject(err) : resolve(data.Body.toString('utf-8'))
            });
        });     
    };

    const getWidgetsDefinitionsWithHTML = (configuration) => {

        const getWidgetsProp = (c, fn) => {
            const inner = (configuration) => {
                const ret = [];

                configuration.forEach(c => {
                    ret.push(fn(c));
                    
                    if (c.areas) {
                        Object.keys(c.areas).forEach(key => {
                            ret.push.apply(ret, inner(c.areas[key]));
                        });
                    }
                });

                return ret;
            };

            return [...new Set(inner(c))];
        };

        const getWidgetHTML = (wdef) => {
            return new Promise((resolve, reject) => {
                s3.getObject({
                    Bucket: 'awsstaticcms',
                    Key: wdef.html
                }, (err, data) => {
                    if (err) {
                        reject(err);
                    } else {
                        wdef.html = data.Body.toString('utf-8');
                        resolve(wdef);
                    }
                });
            });
        };

        const slugs = getWidgetsProp(configuration, c => c.widget);

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
                    Promise.all(data.Responses['static-cms-widgets'].map(widget => {
                        return getWidgetHTML({
                            slug: widget.slug.S,
                            name: widget.name.S,
                            html: widget.html.S,
                            props: JSON.parse(widget.props.S),
                        });
                    })).then(arr => resolve(arr));
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
                    configuration: JSON.parse(data.Item.configuration.S),
                    props: JSON.parse(data.Item.props.S),
                    template: data.Item.template.S
                }).then(() => {
                    http200({});
                });
            }
        });
    } else {
        http404();
    }
};
