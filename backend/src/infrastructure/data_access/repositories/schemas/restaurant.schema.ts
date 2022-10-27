import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Type } from 'class-transformer';
import mongoose, { Document, Types } from 'mongoose';
import { BaseDocument } from '../../../database/mongoDB/base-document';
import { IRestaurantdata } from '../interfaces/restaurant-model.interface';
import { LocationData, LocationSchema } from './location.schema';
import { MerchantData } from './merchant.schema';

export type RestaurantDocument = RestaurantData & Document;

@Schema({ versionKey: false })
export class RestaurantData extends BaseDocument implements IRestaurantdata {
  @Prop({ type: String, required: true })
  name: string;

  @Prop({ type: String, required: true, unique: true })
  email: string;

  @Prop({ type: Boolean, required: true, default: false })
  isActive: boolean;

  @Prop({ type: String })
  webUrl?: string;

  @Prop({ type: String })
  logoUrl?: string;

  @Prop({ type: String })
  timeZone?: string;

  @Prop({ type: String })
  phoneNumber: string;

  @Prop({ type: LocationSchema })
  @Type(() => LocationData)
  location: LocationData;

  @Prop({ type: Types.ObjectId })
  merchantId: Types.ObjectId;

  @Prop({ type: mongoose.Schema.Types.ObjectId, ref: MerchantData.name })
  @Type(() => MerchantData)
  merchant: MerchantData;
}

export const RestaurantSchema = SchemaFactory.createForClass(RestaurantData);
