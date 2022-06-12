import * as geofire from "geofire-common"
import { knex, Knex } from "knex"
import postgis from "knex-postgis"
import { ItemData, ItemFilter, UserData, validateItem, ItemFilterKey, getItemKeywords, DefaultItemData, DefaultItemFilter, ItemInfo, UserInteractsItem } from "./DataTypes";
import * as uuid from "uuid"
import dotenv from 'dotenv'
import pg from 'pg'

// IMPORTANT! Always use "double quotes" when using any raw query

/*  [WORKING] -> Function has recently been tested and shown to work
    [NEEDS CHECK] -> Function hasn't changed through multiple updates to code and needs to be tested
    [BROKEN] -> Functions needs to be fixed or removed
 */

// Set type parsers for pg (otherwise numbers may be returned as strings)
pg.types.setTypeParser(pg.types.builtins.NUMERIC, parseFloat)
pg.types.setTypeParser(pg.types.builtins.FLOAT4, parseFloat)
pg.types.setTypeParser(pg.types.builtins.FLOAT8, parseFloat)
pg.types.setTypeParser(pg.types.builtins.MONEY, parseFloat)
pg.types.setTypeParser(pg.types.builtins.INT2, parseInt)
pg.types.setTypeParser(pg.types.builtins.INT4, parseInt)
pg.types.setTypeParser(pg.types.builtins.INT8, parseInt)

if (!process.env.PG_USER) {
    dotenv.config()
}
// [WORKING] Create a pool for the PostgreSQL database
const createCloudPool = (config?: Knex.Config) => {
    const dbSocketPath = process.env.PG_SOCKET_PATH || '/cloudsql';
    // Establish a connection to the database
    return knex({
        client: 'pg',
        connection: {
            user : process.env.PG_USER,
            password : process.env.PG_PASS,
            database : process.env.PG_DATABASE,
            host: `${dbSocketPath}/${process.env.PG_INSTANCE}`
        },
        // ... Specify additional properties here.
        ...config,
    });
};
const POOL = createCloudPool()
const pgis = postgis(POOL)

// [WORKING] Removes all values from data that shouldn't be sent to a user
const formatItemData = (data: any) => {
    let newData = data
    const safeKeys = Object.keys(DefaultItemData)
    // Delete any properties that are not part of ItemData type
    for (const key of Object.keys(newData)) {
        if (!safeKeys.includes(key)) {
            delete newData[key]
        }
    }
    // Parse numerics
    const parsedPrice = parseFloat(newData.price)
    if (!isNaN(parsedPrice)) {
        newData.price = parsedPrice
    }
    return newData as ItemData
}
// [WORKING] Updates the last view times of an array of items
const updateViewTimes = async (userID: string, items: ItemData[]) => {
    const currentTime = Date.now()
    let numUpdates = await POOL.transaction(async (trx) => {
        const updates = await Promise.all(items.map(async (item) => {
            // A user viewing their own item does not count as a view
            if (item.userID === userID) {
                return 0
            }
            const numInserts = await Promise.all([
                // Update UserInteractsItem (perform an 'upsert')
                trx.raw(`
                INSERT INTO "UserInteractsItem" ("userID", "itemID", "viewTime")
                VALUES ('${userID}', '${item.itemID}', ${currentTime})
                ON CONFLICT ON CONSTRAINT "UserInteractsItem_pkey"
                DO UPDATE SET
                    "userID" = excluded."userID",
                    "itemID" = excluded."itemID",
                    "viewTime" = excluded."viewTime"
                    WHERE "UserInteractsItem"."userID" = '${item.userID}'
                    AND "UserInteractsItem"."itemID" = '${item.itemID}'
                `),
                // Update Item
                trx('Item').where({itemID: item.itemID}).increment('viewCount', 1)
            ])
            // Get number of inserts / merges performed (should be 1)
            return numInserts[0].length
        }))
        // Sum up number of updates
        return updates.length > 0 ? updates.reduce((total, num) => total + num) : 0
    })
    return numUpdates
}
// [WORKING] Takes a query for some items and adds additional information to the result
const getItemsWithInfo = async (userID: string, itemQuery: Knex.QueryBuilder) => {
    // Join with UserInteractsItem to get the last time this user viewed and liked the items (get ItemInfo)
    let query = POOL.raw(`
    SELECT i.*, uit."viewTime", uit."likeTime", uit."favTime"
    FROM (${itemQuery.toQuery()}) AS i
    LEFT JOIN "UserInteractsItem" AS uit
        ON i."itemID" = uit."itemID"
        AND uit."userID" = '${userID}'
    `)
    // Get results
    const result: any[] = (await query).rows
    const itemInfos = result.map((data) => {
        let distance: number | null = null
        // Format distance
        if (data['distInM'] !== undefined) {
            distance = Math.ceil(data['distInM']/1000)
            if (distance < 1) {
                distance = 1
            }
        }
        return {
            viewTime: data.viewTime,
            likeTime: data.likeTime,
            favTime: data.favTime,
            item: formatItemData(data),
            distance: distance
        }
    }) as ItemInfo[]
    await updateViewTimes(userID, itemInfos.map(({item}) => item))
    return itemInfos
}

// Creates a user's data
export const createUser = async (userData: UserData) => {
    try {
        await POOL('User').insert(userData)
    } catch (e) {
        console.error(e)
        throw new Error(`Could not insert user of ID: ${userData.userID}`)
    }
}
// [WORKING] Retrieves a user's data
export const getUser = async (userID: string) => {
    const result = await POOL('User').where({userID: userID})
    // Validate result
    if (result.length > 1) {
        throw new Error(`Wrong number of items returned for getUser query: ${result.length}`)
    } else if (result.length < 1) {
        throw new Error(`Could not find user of ID: ${userID}`)
    }
    return result[0] as UserData
}
// [WORKING] Updates a user's data
export const updateUser = async (userID: string, userData: Partial<UserData>) => {
    // Ensure user does not change their userID
    userData.userID = userID
    await POOL('User').where({userID: userID}).update(userData)
}
// [WORKING] Adds a new user to the database
export const addUserData = async (userData: UserData) => {
    await POOL('User').insert(userData)
    return userData.userID
}
// [WORKING] Retrieves multiple (viewable) items, along with their distances
export const getItemsFromIDs = async (userID: string, itemIDs: string[], coords?: {lat: number, long: number}) => {
    // Create selections for query
    const selections: any[] = ['*']
    // Add coords to query
    if (coords) {
        selections.push(pgis.distanceSphere(pgis.geometry('geoCoords'), pgis.makePoint(coords.long, coords.lat)).as('distInM'))
    }
    let query = POOL('Item')
        .select(selections)
        .whereIn('itemID', itemIDs)
        .where((subQuery) => {
            subQuery.where({isVisible: true}).orWhere({userID: userID})
        })
    return await getItemsWithInfo(userID, query)
}
// [WORKING] Retrieves all (viewable) items that a specific user has available, along with their distances
export const getUserItems = async (requestingUserID: string, targetUserID: string, coords?: {lat: number, long: number}) => {
    // Create selections for query
    const selections: any[] = ['*']
    if (coords) {
        selections.push(pgis.distanceSphere(pgis.geometry('geoCoords'), pgis.makePoint(coords.long, coords.lat)).as('distInM'))
    }
    let query = POOL('Item').select(selections)
    .where({userID: targetUserID})
    // If not a user retrieving their own items, filter for visibility
    if (requestingUserID !== targetUserID) {
        query = query.andWhere({isVisible: true})
    }
    return await getItemsWithInfo(requestingUserID, query)
}
// [WORKING] Executes a custom query and returns all items
export const getFilteredItems = async (userID: string, filters: ItemFilter, coords?: {lat: number, long: number}) => {
    // Create selections for query
    const selections: any[] = ['*']
    if (coords) {
        selections.push(pgis.distanceSphere(pgis.geometry('geoCoords'), pgis.makePoint(coords.long, coords.lat)).as('distInM'))
    }
    let query = POOL('Item').select(selections)
    for (const key of (Object.keys(filters) as ItemFilterKey[])) {
        //Pre-check for undefined or null
        if (filters[key] === undefined || filters[key] === null) {
            continue
        }
        // Check each key and value of the filter to see if they are defined, and add to the query
        if (key === 'distanceInKM') {
            if (coords) {
                const target_geog = pgis.makePoint(coords.long, coords.lat)
                query = query.where(pgis.dwithin(target_geog, 'geoCoords', filters.distanceInKM!*1000, false))
                continue
            }
            throw new Error(`Filter has distance but no coordinates were given.`)
        // Price filter
        } else if (key === 'priceRange') {
            if (filters.priceRange!.length !== 2) {
                continue
            }
            query = query.whereBetween('price', [filters.priceRange![0], filters.priceRange![1]])
            continue
        // Keyword filter
        } else if (key === 'keywords') {
            query = query.where('keywords', '&&', filters.keywords!)
        // Delivery method filter
        } else if (key === 'deliveryMethods') {
                query = query.where('deliveryMethods', '&&', filters.deliveryMethods!)
        // Quantity filter
        } else if (key === 'limit') {
            continue
        // Array filters
        } else if (Array.isArray(DefaultItemFilter[key])) {
            query.whereIn(key, filters[key] as any[])
        // Equality filters (everything else)
        } else {
            query = query.where({[key]: filters[key]})
        }
    }
    // Ensure no hidden items are shown
    query = query.where({isVisible: true})
    // Always order by keywords first
    if (filters.keywords && filters.keywords.length > 0) {
        const keywordsString = `'{"${filters.keywords.join(`", "`)}"}'::text[]`
        query = query.orderByRaw(`cardinality(array_intersect("keywords", ${keywordsString})) DESC`)
    // Otherwise try to order by distance
    } else if (filters.distanceInKM && coords) {
        query = query.orderBy('distInM', 'asc')
    // Otherwise try to order by price
    } else if (filters.priceRange) {
        query = query.orderBy('price', 'asc')
    }
    // Add limit if it exists, at end of query
    if (filters.limit) {
        query = query.limit(filters.limit)
    }
    return await getItemsWithInfo(userID, query)
}
// [NEEDS CHECK] Creates a new item, and returns the item ID
export const createItem = async (userID: string, itemData: ItemData) => {
     // Check for item ID
     if (!itemData.itemID) {
        throw new Error('No item ID was found when trying to update item')
    }
    const userData = await getUser(userID)
    // Validate location of the user
    geofire.validateLocation([userData.lat, userData.long])
    //Generate a new item ID
    const newItemID = uuid.v4()
    // Update new item's data
    const newItemData: ItemData = {
        ...DefaultItemData,
        ...itemData,
        itemID: newItemID,
        userID: userID,
        country: userData.country,
        region: userData.region,
        images: [],
    }
    // Make sure recent price is always more than or equal to minimum price
    newItemData.recentPrice = newItemData.minPrice > newItemData.recentPrice ? newItemData.minPrice : newItemData.recentPrice
    newItemData.keywords = getItemKeywords(newItemData)
    // Check validity of item's data
    newItemData.isVisible = itemData.isVisible && validateItem(newItemData)
    // Make geog for item
    const coords = pgis.makePoint(userData.long, userData.lat)
    // Get data to be sent to database
    const newData = {
        ...newItemData,
        geoCoords: coords
    }
    await POOL('Item').insert(newData)
    return newItemID
}
// [WORKING] Updates an item's data
export const updateItem = async (userID: string, itemData: Partial<ItemData>) => {
    // Check for item ID
    if (!itemData.itemID) {
        throw new Error('No item ID was found when trying to update item')
    }
    const userData = await getUser(userID)
    // Validate location of the user
    geofire.validateLocation([userData.lat, userData.long])
    // Get old item data
    const oldResult = (await POOL('Item').where({userID: userID, itemID: itemData.itemID}).select('*'))[0]
    const oldItemData = formatItemData(oldResult)
    // Update and validate new data
    const newItemData: ItemData = {
        ...DefaultItemData,
        ...oldItemData,
        ...itemData,
        // Prevent this item's IDs from being changed
        userID: userID,
        itemID: oldItemData.itemID
    }
    newItemData.recentPrice = newItemData.minPrice > newItemData.recentPrice ? newItemData.minPrice : newItemData.recentPrice
    newItemData.keywords = getItemKeywords(newItemData)
    newItemData.isVisible = itemData.isVisible && validateItem(newItemData)
    // Make geog for item
    const coords = pgis.makePoint(userData.long, userData.lat)
    // Set update data for item
    const updateData = {
        ...newItemData,
        geoCoords: coords
    }
    await POOL('Item').where({userID: userID, itemID: itemData.itemID}).update(updateData)
    return
}
// [NEEDS CHECK] Delete an item
export const deleteItem = async (userID: string, itemData: ItemData) => {
    POOL('Item').where({itemID: itemData.itemID}).del()
}
// [NEEDS CHECK] Unlikes an item, updates the item's price and like count
export const unlikeItem = async (userID: string, itemID: string) => {
    // Get all 'like' interactions for this item, sorted descending
    const itemInteractions = (await POOL('UserInteractsItem')
        .select('*')
        .where({itemID: itemID})
        .whereNotNull('likeTime')
        .orderBy('likePrice', 'desc')
    ) as UserInteractsItem[]
    // Find this user's like
    const userInteraction = itemInteractions.find((uit) => (uit.userID === userID))
    if (!userInteraction) {
        throw new Error('Could not find user like in UserInteractsItem')
    }
    // Get item data
    let itemInfo = (await getItemsFromIDs(userID, [itemID]))[0]
    let revertedPrice = itemInfo.item.minPrice
    // Check if there are other likes
    if (itemInteractions.length > 1) {
        // Check if this user's like price is the highest
        if (itemInteractions[0].userID === userID) {
            revertedPrice = itemInteractions[0].likePrice
            /* 
                Send some notification to second highest user to let them
                know they now have the highest price, and notify seller that price has gone down
            */
        } // Otherwise price does not need to be updated
        else {
            revertedPrice = itemInfo.item.recentPrice
        }
    }
    await POOL.transaction(async (trx) => {
        await Promise.all([
            trx.raw(`
                INSERT INTO "UserInteractsItem" ("userID", "itemID", "likeTime", "likePrice")
                VALUES ('${userID}', '${itemID}', NULL, NULL)
                ON CONFLICT ON CONSTRAINT "UserInteractsItem_pkey"
                DO UPDATE SET
                    "userID" = excluded."userID",
                    "itemID" = excluded."itemID",
                    "likeTime" = excluded."likeTime",
                    "likePrice" = excluded."likePrice"
                    WHERE "UserInteractsItem"."userID" = '${userID}'
                    AND "UserInteractsItem"."itemID" = '${itemID}'
                `),
            trx('Item').where({itemID: itemID}).update({recentPrice: revertedPrice}).decrement('likeCount', 1)
        ])
    })
}
/* [NEEDS CHECK] Likes an item, updates the user's liked items list and the item's user likes list.
    The same user liking an item twice will count as 2 likes,
    a 'like' should represent the number of times the price has increased on an item
*/
export const likeItem = async (userID: string, itemID: string) => {
    // Get all 'like' interactions for this item, sorted descending
    const itemInteractions = (await POOL('UserInteractsItem')
        .select('*')
        .where({itemID: itemID})
        .whereNotNull('likeTime')
        .orderBy('likePrice', 'desc')
    ) as UserInteractsItem[]
    // Check if this user has already liked this item, and if they have the highest price
    if (itemInteractions.length > 1 && itemInteractions[0].userID === userID) {
        return itemInteractions[0].likeTime
    }
    let itemInfo = (await getItemsFromIDs(userID, [itemID]))[0]
    // Increase price of item by 5% (rounded up)
    let newPrice = Math.ceil(itemInfo.item.recentPrice*1.05)
    // Check if price is too low to use percentage
    if (itemInfo.item.recentPrice*0.05 < 2.5) {
        // Add $2.50 to price instead
        newPrice = itemInfo.item.recentPrice + 2.5
    }
    const currentTime = Date.now()
    await POOL.transaction(async (trx) => {
        await Promise.all([
            trx.raw(`
                INSERT INTO "UserInteractsItem" ("userID", "itemID", "likeTime", "likePrice")
                VALUES ('${userID}', '${itemID}', ${currentTime}, ${itemInfo.item.recentPrice})
                ON CONFLICT ON CONSTRAINT "UserInteractsItem_pkey"
                DO UPDATE SET
                    "userID" = excluded."userID",
                    "itemID" = excluded."itemID",
                    "likeTime" = excluded."likeTime",
                    "likePrice" = excluded."likePrice"
                    WHERE "UserInteractsItem"."userID" = '${userID}'
                    AND "UserInteractsItem"."itemID" = '${itemID}'
                `),
            trx('Item').where({itemID: itemID}).update({recentPrice: newPrice}).increment('likeCount', 1)
        ])
    })
    return currentTime
}