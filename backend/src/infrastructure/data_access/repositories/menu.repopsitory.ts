import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, FilterQuery, Model, Types } from 'mongoose';
import { GenericDocumentRepository } from '../../../infrastructure/database';
import { Item } from '../../../item';
import { IMenuRepository } from '../repositories/interfaces/menu-repository.interface';
import { TYPES } from './../../../application/constants/types';
import { Result } from './../../../domain/result/result';
import { Menu } from './../../../menu/menu';
import { MenuMapper } from './../../../menu/menu.mapper';
import { IItemRepository } from './interfaces';
import { MenuDataModel, MenuDocument } from './schemas/menu.schema';

@Injectable()
export class MenuRepository extends GenericDocumentRepository<Menu, MenuDocument> implements IMenuRepository {
  menuMapper: MenuMapper;
  constructor(
    @InjectModel(MenuDataModel.name) menuDataModel: Model<MenuDocument>,
    @Inject(TYPES.IItemRepository) private readonly itemRepository: IItemRepository,
    @InjectConnection() readonly connection: Connection,
    menuMapper: MenuMapper,
  ) {
    super(menuDataModel, connection, menuMapper);
    this.menuMapper = menuMapper;
  }

  async getMenus(filterQuery: FilterQuery<Menu>): Promise<Menu[] | Result<unknown>> {
    const documents = await this.DocumentModel.find(filterQuery).populate('category').exec();
    if (!documents) {
      return Result.fail('Error getting Menus from database', HttpStatus.NOT_FOUND);
    }
    const menus = documents.map((doc) => this.menuMapper.toDomain(doc));
    return await this.deleteAndSetItemsAndAddons(menus);
  }

  async deleteAndSetItemsAndAddons(menus: Menu[]): Promise<Menu[]> {
    const itemsMap = new Map<Types.ObjectId, { items: Types.ObjectId[] | Item[] }>();
    menus.forEach((menu) => {
      itemsMap.set(menu.id, { items: menu.items.map((item) => item.id) });
    });

    for (const [key, value] of itemsMap) {
      const items = await this.itemRepository.getItemsByIds(value.items as Types.ObjectId[]);
      if (items.length !== value.items.length) {
        await this.findOneAndUpdate({ _id: key }, { items: items.map((i) => i.id) });
      }
      const menu = (await this.getMenuById(key)).getValue();
      if (menu) {
        menu.items = items;
      }
      if (items?.length) itemsMap.set(key, { items });
    }

    menus.forEach((menu) => {
      if (itemsMap.has(menu.id)) {
        menu.items = itemsMap.get(menu.id).items as Item[];
      }
    });
    return menus;
  }

  async getMenuById(id: Types.ObjectId): Promise<Result<Menu>> {
    const document = await this.DocumentModel.findById(id).populate('itemDetails').populate('category').exec();
    const menu: Menu = this.menuMapper.toDomain(document);
    if (!document) {
      return Result.fail('Error getting menu from database', HttpStatus.NOT_FOUND);
    }
    const { items } = menu;

    if (items?.length) {
      const itemsIds = items.map((item) => item.id);
      const menuItems = await this.itemRepository.getItemsByIds(itemsIds);
      if (menuItems?.length) {
        menu.items = menuItems;
      }
    }
    return Result.ok(menu);
  }

  async createMenu(menuModel: MenuDataModel): Promise<Result<any>> {
    const doc = new this.DocumentModel({
      ...menuModel,
      _id: new Types.ObjectId(),
    });
    const result = (await doc.save()).toJSON();
    if (!result) {
      return Result.fail('An Error occured, unable to save document in the db', HttpStatus.INTERNAL_SERVER_ERROR);
    }
    return Result.ok(result);
  }

  async updateMenu(filter: any, query: any): Promise<Menu | Result<Menu>> {
    const document = await this.DocumentModel.findOneAndUpdate(filter, query);
    if (!document) {
      return Result.fail('Error while updating menu', HttpStatus.INTERNAL_SERVER_ERROR);
    }
    const menu = (await this.getMenuById(document.id)).getValue();
    return menu;
  }

  async deleteMenu(id: Types.ObjectId): Promise<boolean> {
    const session = await this.startSession();
    try {
      session.startTransaction();
      const response = await this.getMenuById(id);
      const menu = response.getValue();
      const itemIds = menu.items.map((item) => item.id);
      await Promise.all([this.deleteOne({ _id: id }), this.itemRepository.deleteMany({ _id: { $in: itemIds } })]);
      session.commitTransaction();
      return true;
    } catch (error) {
      session.abortTransaction();
      console.error(error);
    } finally {
      session.endSession();
    }
  }

  async getMenuByRestaurantId(restaurantId: string): Promise<Result<Menu[]>> {
    const documents = await this.DocumentModel.find({ restaurantId }).populate('items').exec();
    if (!documents) {
      return Result.fail(
        `An Error occured, unable to retrieve ${restaurantId} menus from db`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    const menus = documents.map((doc) => this.menuMapper.toDomain(doc));
    return Result.ok(menus);
  }
}
