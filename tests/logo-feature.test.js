const assert = require('assert');
const fs = require('fs');
const path = require('path');

const homeTemplate = fs.readFileSync(path.join(__dirname, '..', 'views', 'home.ejs'), 'utf8');
const adminTemplate = fs.readFileSync(path.join(__dirname, '..', 'views', 'admin-company.ejs'), 'utf8');

assert.ok(homeTemplate.includes('hero-logo'), 'home template should render the hero logo');
assert.ok(homeTemplate.includes('featured-panel'), 'home template should keep the benefits card under Featured Products');
assert.ok(adminTemplate.includes('name="companyLogoUrl"'), 'admin template should expose a logo URL field');
assert.ok(adminTemplate.includes('name="logoFile"'), 'admin template should expose a logo upload field');
assert.ok(adminTemplate.includes('enctype="multipart/form-data"'), 'admin form should support file uploads');
console.log('logo-feature-test: ok');
