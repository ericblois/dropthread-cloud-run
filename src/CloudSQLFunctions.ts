import * as geofire from "geofire-common"
import { knex, Knex } from "knex"
import postgis from "knex-postgis"
import { ItemData, ItemFilter, UserData, validateItem, ItemFilterKey, getItemKeywords, DefaultItemData, DefaultItemFilter } from "./DataTypes";
import * as uuid from "uuid"
import dotenv from 'dotenv'

if (!process.env.PG_USER) {
    dotenv.config()
}

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

// Removes all values from data that shouldn't be sent to a user
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
// Creates a user's data
export const createUser = async (userData: UserData) => {
    try {
        await POOL('User').insert(userData)
    } catch (e) {
        console.error(e)
        throw new Error(`Could not insert user of ID: ${userData.userID}`)
    }
}
// Retrieves a user's data
export const getUser = async (userID: string) => {
    try {
        const result = await POOL('User').where({userID: userID})
        // Validate result
        if (result.length > 1) {
            throw new Error(`Wrong number of items returned for getUser query: ${result.length}`)
        } else if (result.length < 1) {
            throw new Error(`Could not find user of ID: ${userID}`)
        }
        const itemData = result[0] as UserData
        return itemData
    } catch (e) {
        throw new Error(`Could not find user of ID: ${userID}`)
    }
}
// Updates a user's data
export const updateUser = async (userData: Partial<UserData>) => {
    try {
        await POOL('User').where({userID: userData.userID}).update(userData)
        return
    } catch (e) {
        throw new Error(`Could not find user of ID: ${userData.userID}`)
    }
}
// Adds a new user to the database
export const addUserData = async (userData: UserData) => {
    try {
        await POOL('User').insert(userData)
        return userData.userID
    } catch (e) {
        console.error(e)
        throw e
    }
}
// Retrieves an item, along with its distance
export const getItem = async (userID: string, itemID: string, coords?: {lat: number, long: number}, bypass = false) => {
    try {
        // Create selections for query
        const selections: any[] = ['*']
        if (coords !== undefined) {
            selections.push(pgis.distanceSphere(pgis.geometry('geoCoords'), pgis.makePoint(coords.long, coords.lat)).as('distInM'))
        }
        let query = POOL('Item')
        .select(selections)
        .where({itemID: itemID})
        if (!bypass) {
            query = query.where((subQuery) => {
                subQuery.where({isVisible: true}).orWhere({userID: userID})
            })
        }
        const result = await query
        if (result.length > 1) {
            throw new Error(`Wrong number of items returned for getItem query: ${result.length}`)
        } else if (result.length < 1) {
            throw new Error(`Could not find item of ID: ${itemID}`)
        }
        const itemData = result[0]
        let distance = -1
        // Format distance
        if (itemData['distInM'] !== undefined) {
            distance = Math.ceil(itemData['distInM']/1000)
            if (distance < 1) {
                distance = 1
            }
        }
        return {item: formatItemData(itemData), distance: distance}
    } catch (e) {
        throw new Error(`Could not find item of ID: ${itemID}`)
    }
}
// Retrieves multiple (viewable) items, along with their distances
export const getItems = async (userID: string, itemIDs: string[], coords?: {lat: number, long: number}) => {
    try {
        // Create selections for query
        const selections: any[] = ['*']
        if (coords) {
            selections.push(pgis.distanceSphere(pgis.geometry('geoCoords'), pgis.makePoint(coords.long, coords.lat)).as('distInM'))
        }
        const results = await POOL('Item')
            .select(selections)
            .whereIn('itemID', itemIDs)
            .where((subQuery) => {
                subQuery.where({isVisible: true}).orWhere({userID: userID})
            })
        const itemDatas = results.map((data) => {
            let distance = -1
            // Format distance
            if (data['distInM'] !== undefined) {
                distance = Math.ceil(data['distInM']/1000)
                if (distance < 1) {
                    distance = 1
                }
            }
            return {
                item: formatItemData(data),
                distance: distance
            }
        })
        return itemDatas
    } catch (e) {
        console.log(e)
        throw new Error(`Could not find items.`)
    }
}
// Retrieves all (viewable) items that a specific user has available, along with their distances
export const getUserItems = async (requestingUserID: string, targetUserID: string, coords?: {lat: number, long: number}) => {
    try {
        // Create selections for query
        const selections: any[] = ['*']
        if (coords !== undefined) {
            selections.push(pgis.distanceSphere(pgis.geometry('geoCoords'), pgis.makePoint(coords.long, coords.lat)).as('distInM'))
        }
        let query = POOL('Item').select(selections)
        .where({userID: targetUserID})
        // If not a user retrieving their own items, filter for visibility
        if (requestingUserID !== targetUserID) {
            query = query.andWhere({isVisible: true})
        }
        const results = await query
        const itemDatas = await Promise.all(results.map(async (data) => {
            // Format distance
            let distance = -1
            if (data['distInM'] !== undefined) {
                distance = Math.ceil(data['distInM']/1000)
                if (distance < 1) {
                    distance = 1
                }
            }
            return {item: formatItemData(data), distance: distance}
        }))
        return itemDatas
    } catch (e) {
        throw e
    }
}
// Executes a custom query and returns all items
export const getFilteredItems = async (userID: string, filters: ItemFilter, coords?: {lat: number, long: number}) => {
    try {
        // Create selections for query
        const selections: any[] = ['*']
        if (coords !== undefined) {
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
            query = query.orderByRaw(`cardinality(array_intersect(keywords, ${keywordsString})) DESC`)
        // Otherwise try to order by distance
        } else if (filters.distanceInKM && coords) {
            query = query.orderByRaw(`ST_DistanceSphere(coords::geometry, ${pgis.makePoint(coords.long, coords.lat)}) ASC`)
        // Otherwise try to order by price
        } else if (filters.priceRange) {
            query = query.orderBy('price', 'asc')
        }
        // Add limit if it exists, at end of query
        if (filters.limit) {
            query = query.limit(filters.limit)
        }
        // Join with UserInteractsItem to get the last time this user viewed and liked the items
        POOL.with('Item', query).leftJoin('UserInteractsItem', (join) => {
            join.on('Item.itemID', '=', 'UserInteractsItem.itemID')
            .andOn('UserInteractsItem.userID', '=', userID)
        }).select(['Item.*', 'UserInteractsItem.viewTime as viewTime', 'UserInteractsItem.likeTime as likeTime', 'UserInteractsItem.favTime as favTime'])
        // Get results
        const results = await query
        const itemDatas = results.map((data) => {
            // Format distance
            let distance = -1
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
        })
        return itemDatas
    } catch (e) {
        throw new Error(`Could not find items.`)
    }
}
// Creates a new item, and returns the item ID
export const createItem = async (userID: string, itemData: ItemData) => {
    try {
        const userData = await getUser(userID)
        // Validate location of the user
        try {
            geofire.validateLocation([userData.lat, userData.long])
        } catch (e) {
            throw new Error("User has an invalid location.")
        }
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
    } catch (e) {
        throw e
    }
}
// Updates an item's data
export const updateItem = async (userID: string, itemData: ItemData, bypass = false) => {
    try {
        // Skip other steps if called by a trigger function
        if (bypass) {
            await POOL('Item').where({itemID: itemData.itemID}).update(itemData)
            return
        }
        const userData = await getUser(userID)
        // Validate location of the user
        try {
            geofire.validateLocation([userData.lat, userData.long])
        } catch (e) {
            throw new Error("Invalid location.")
        }
        const newItemData: ItemData = {
            ...DefaultItemData,
            ...itemData,
            // Prevent this item's userID from being changed
            userID: userID,
            country: userData.country,
            region: userData.region,
        }
        newItemData.keywords = getItemKeywords(newItemData)
        newItemData.isVisible = itemData.isVisible && validateItem(itemData)
        // Make geog for item
        const coords = pgis.makePoint(userData.long, userData.lat)
        // Set update data for item
        const updateData = {
            ...newItemData,
            geoCoords: coords
        }
        await POOL('Item').where({itemID: itemData.itemID}).update(updateData)
        return
    } catch (e) {
        throw new Error(`Could not find item of ID: ${itemData.itemID}`)
    }
}
// Delete an item
export const deleteItem = async (userID: string, itemData: ItemData) => {
    try {
        POOL('Item').where({itemID: itemData.itemID}).del()
        return
    } catch (e) {
        throw new Error(`Could not delete item of ID: ${itemData.itemID}`)
    }
}
// Updates the last view times of an array of items
export const updateViewTimes = async (userID: string, viewedItemIDs: string[]) => {
    try {
        const currentTime = Date.now()
        await POOL.transaction(async (trx) => {
            // Iterate through each item ID
            const updates = Promise.all(viewedItemIDs.map((itemID) => {
                return Promise.all([
                    // Update both UserViewsItem and ItemData
                    trx('UserInteractsItem')
                    .where({
                        itemID: itemID,
                        userID: userID
                    })
                    .upsert({
                        userID: userID,
                        itemID: itemID,
                        viewtime: currentTime
                    }),
                    trx('Item').where({itemID: itemID}).increment('viewCount', 1)
                ])
            }))
            await updates
        })
    } catch (e) {
        throw new Error(`Could not update view times of items.`)
    }
}
// Unlikes an item, updates the user's liked items list and the item's likeCount
export const unlikeItem = async (userID: string, itemID: string) => {
    try {
        await POOL.transaction(async (trx) => {
            await Promise.all([
                trx('UserInteractsItem')
                .where({
                    itemID: itemID,
                    userID: userID
                })
                .whereNotNull('likeTime')
                .upsert({
                    userID: userID,
                    itemID: itemID,
                    likeTime: null
                }),
                trx('Item').where({itemID: itemID}).decrement('likeCount', 1)
            ])
        })
    } catch (e) {
        throw new Error(`Could not unlike item of ID: ${itemID}`)
    }
}
// Likes an item, updates the user's liked items list and the item's user likes list
export const likeItem = async (userID: string, itemID: string) => {
    try {
        await POOL.transaction(async (trx) => {
            await Promise.all([
                trx('UserInteractsItem')
                .where({
                    itemID: itemID,
                    userID: userID
                })
                .whereNull('likeTime')
                .upsert({
                    userID: userID,
                    itemID: itemID,
                    likeTime: Date.now()
                }),
                trx('Item').where({itemID: itemID}).increment('likeCount', 1)
            ])
        })
    } catch (e) {
        throw new Error(`Could not like item of ID: ${itemID}`)
    }
}