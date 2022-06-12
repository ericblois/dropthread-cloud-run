/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
    return knex.schema
    .raw(`
        CREATE EXTENSION IF NOT EXISTS postgis;
    `)
    .createTable('User', table => {
        table.text('userID').notNullable().primary()
        table.text('name').notNullable()
        table.text('email').notNullable()
        table.text('gender').notNullable()
        table.text('birthDay').notNullable()
        table.text('birthMonth').notNullable()
        table.text('birthYear').notNullable()
        table.text('country').notNullable()
        table.text('region').nullable()
        table.double('lat').notNullable()
        table.double('long').notNullable()
    }).createTable('Item', table => {
        table.uuid('itemID').primary()
        table.text('userID').references('userID').inTable('User')
        table.text('name').notNullable()
        table.text('description').notNullable()
        table.decimal('price', 7, 2).notNullable()
        table.text('category').notNullable()
        table.text('gender').notNullable()
        table.text('size').notNullable()
        table.text('fit').notNullable()
        table.text('condition').notNullable()
        table.specificType('images', 'text ARRAY').notNullable()
        table.text('country').notNullable()
        table.text('region').nullable()
        table.specificType('deliveryMethods', 'text ARRAY').notNullable()
        table.specificType('styles', 'text ARRAY').notNullable()
        table.specificType('keywords', 'text ARRAY').notNullable()
        table.geography('geoCoords').notNullable()
        table.integer('viewCount').notNullable()
        table.integer('likeCount').notNullable()
        table.integer('favCount').notNullable()
        table.boolean('isVisible').notNullable()
    }).createTable('ShippingInfo', table => {
        table.text('userID').references('userID').inTable('User')
        table.text('name').notNullable()
        table.text('streetAddress').notNullable()
        table.text('city').notNullable()
        table.text('region').nullable()
        table.text('country').notNullable()
        table.text('postalCode').notNullable()
        table.text('apartment').nullable()
        table.text('message').nullable()
        table.primary(['userID', 'name'])
    }).createTable('UserInteractsItem', table => {
        table.text('userID').references('userID').inTable('User')
        table.uuid('itemID').references('itemID').inTable('Item')
        table.bigInteger('viewTime')
        table.bigInteger('likeTime')
        table.bigInteger('favTime')
        table.primary(['userID', 'itemID'])
    }).createTable('Message', table => {
        table.text('userID1').references('userID').inTable('User')
        table.text('userID2').references('userID').inTable('User')
        table.text('message').notNullable()
        table.bigInteger('time').notNullable()
        table.primary(['userID1', 'userID2'])
    }).raw(`
    CREATE FUNCTION array_intersect(anyarray, anyarray)
        RETURNS anyarray
        language sql
        as $FUNCTION$
            SELECT ARRAY(
                SELECT UNNEST($1)
                INTERSECT
                SELECT UNNEST($2)
            );
        $FUNCTION$;
    `)
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema
    .raw(`
        DROP FUNCTION array_intersect(anyarray, anyarray);
    `)
    .dropTable('Message')
    .dropTable('UserInteractsItem')
    .dropTable('ShippingInfo')
    .dropTable('Item')
    .dropTable('User')
    .raw(`
        DROP EXTENSION IF EXISTS postgis;
    `)
};
