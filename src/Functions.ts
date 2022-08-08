import * as SQL from "./CloudSQLFunctions"
import { Coords, ItemData, ItemFilter, OfferData, UserData } from "./DataTypes";

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
            itemID: string,
            JWTToken: string
        }) => {
            return await SQL.likeItem(data.userID, data.itemID, data.JWTToken)
        },
        getItemLikes: async (data: {
            userID: string,
            itemID: string
        }) => {
            return await SQL.getItemLikes(data.userID, data.itemID)
        },
        subscribeNotifications: async (data: {
            userID: string,
            token: string | null
        }) => {
            await SQL.subscribeNotifications(data.userID, data.token)
        },
        getOffersWithIDs: async (data: {
            userID: string,
            offerIDs: string[]
        }) => {
            return await SQL.getOffersWithIDs(data.userID, data.offerIDs)
        },
        getOffersWithUser: async (data: {
            userID: string
        }) => {
            return await SQL.getOffersWithUser(data.userID)
        },
        getOffersWithItem: async (data: {
            userID: string,
            itemID: string
        }) => {
            return await SQL.getOffersWithItem(data.userID, data.itemID)
        },
        sendOffer: async (data: {
            userID: string,
            offerData: OfferData,
            fromItemIDs: string[],
            toItemIDs: string[],
            JWTToken: string
        }) => {
            await SQL.sendOffer(data.userID, data.offerData, data.fromItemIDs, data.toItemIDs, data.JWTToken)
        },
        rejectOffer: async (data: {
            userID: string,
            offerID: string,
            JWTToken: string
        }) => {
            await SQL.rejectOffer(data.userID, data.offerID, data.JWTToken)
        }
    }

}