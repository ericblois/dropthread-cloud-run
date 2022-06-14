import * as SQL from "./CloudSQLFunctions"
import { Coords, ItemData, ItemFilter, UserData } from "./DataTypes";

export const functions = {
    GET: {},
    POST: {
        getUser: async (data: {
            userID: string
        }) => {
            return await SQL.getUser(data.userID)
        },
        getItemsFromIDs: async (data: {
            userID: string,
            itemIDs: string[],
            coords: Coords}) => {
            return await SQL.getItemsFromIDs(data.userID, data.itemIDs, data.coords)
        },
        getUserItems: async (data: {
            requestingUserID: string,
            targetUserID: string,
            coords: Coords}) => {
            return await SQL.getUserItems(data.requestingUserID, data.targetUserID, data.coords)
        },
        getLikedItems: async (data: {
            userID: string,
            coords: Coords}) => {
            return await SQL.getLikedItems(data.userID, data.coords)
        },
        getFilteredItems: async (data: {
            userID: string,
            filters: ItemFilter,
            coords: Coords}) => {
            return await SQL.getFilteredItems(data.userID, data.filters, data.coords)
        },
        createUser: async (data: {
            userData: UserData
        }) => {
            return await SQL.createUser(data.userData)
        },
        updateUser: async (data: {
            userID: string,
            userData: Partial<UserData>
        }) => {
            return await SQL.updateUser(data.userID, data.userData)
        },
        createItem: async (data: {
            userID: string,
            itemData: ItemData
        }) => {
            return await SQL.createItem(data.userID, data.itemData)
        },
        updateItem: async (data: {
            userID: string,
            itemData: Partial<ItemData>
        }) => {
            return await SQL.updateItem(data.userID, data.itemData)
        },
        deleteItem: async (data: {
            userID: string,
            itemData: ItemData
        }) => {
            return await SQL.deleteItem(data.userID, data.itemData)
        },
        /*updateViewTimes: async (data: {
            userID: string,
            itemIDs: string[]
        }) => {
            return await SQL.updateViewTimes(data.userID, data.itemIDs)
        },*/
        unlikeItem: async (data: {
            userID: string,
            itemID: string
        }) => {
            return await SQL.unlikeItem(data.userID, data.itemID)
        },
        likeItem: async (data: {
            userID: string,
            itemID: string
        }) => {
            return await SQL.likeItem(data.userID, data.itemID)
        }
    }

}