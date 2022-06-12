/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema
  .alterTable('Item', table => {
    table.decimal('recentPrice', 7, 2).defaultTo(null)
    table.renameColumn('price', 'minPrice')
  })
  .alterTable('UserInteractsItem', table => {
    table.decimal('newPrice', 7, 2).defaultTo(null)
  })
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
    return knex.schema
    .alterTable('UserInteractsItem', table => {
        table.dropColumn('newPrice')
    })
    .alterTable('Item', table => {
        table.dropColumn('recentPrice')
        table.renameColumn('minPrice', 'price')
    })
};
