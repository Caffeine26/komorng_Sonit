import { z } from 'zod';

const menuCategoryPropsSchema = z.object({
    id: z.string(),
    tenantId: z.string(),
    nameKm: z.string().min(1, 'Khmer name is required'),
    nameEn: z.string().min(1, 'English name is required'),
    sortOrder: z.number().int().min(0).default(0),
    isActive: z.boolean().default(true),
    icon: z.string().nullable().optional(),
    urlBanner: z.string().nullable().optional(),
    createdAt: z.date(),
    updatedAt: z.date(),
    deletedAt: z.date().nullable().optional(),
    _count: z.object({
        items: z.number().int()
    }).nullable().optional(),
});

export type MenuCategoryProps = z.infer<typeof menuCategoryPropsSchema>;

export class MenuCategory {
    private constructor(public readonly props: MenuCategoryProps) { }

    public get id(): string {
        return this.props.id;
    }

    public get tenantId(): string {
        return this.props.tenantId;
    }

    // Factory method to create a brand new category (from a user request)
    public static create(
        tenantId: string,
        id: string,
        payload: {
            nameKm: string;
            nameEn?: string;
            sortOrder?: number;
            isActive?: boolean;
            icon?: string | null;
            urlBanner?: string | null;
        }
    ): MenuCategory {
        const props = menuCategoryPropsSchema.parse({
            ...payload,
            id,
            tenantId,
            sortOrder: payload.sortOrder ?? 0,
            isActive: payload.isActive ?? true,
            createdAt: new Date(),
            updatedAt: new Date(),
            deletedAt: null,
        });

        return new MenuCategory(props);
    }

    // Reconstitute method to load an existing category from the Database (via Prisma Mapper)
    public static reconstitute(props: MenuCategoryProps): MenuCategory {
        return new MenuCategory(menuCategoryPropsSchema.parse(props));
    }

    // Update logic
    public update(payload: {
        nameKm?: string;
        nameEn?: string;
        sortOrder?: number;
        isActive?: boolean;
        icon?: string | null;
        urlBanner?: string | null;
    }): void {
        if (payload.nameKm !== undefined) this.props.nameKm = payload.nameKm;
        if (payload.nameEn !== undefined) this.props.nameEn = payload.nameEn;
        if (payload.sortOrder !== undefined) this.props.sortOrder = payload.sortOrder;
        if (payload.isActive !== undefined) this.props.isActive = payload.isActive;
        if (payload.icon !== undefined) this.props.icon = payload.icon;
        if (payload.urlBanner !== undefined) this.props.urlBanner = payload.urlBanner;

        this.props.updatedAt = new Date();

        // Ensure invariants still hold after updating
        menuCategoryPropsSchema.parse(this.props);
    }

    // Soft delete logic
    public delete(): void {
        if (this.props.deletedAt) {
            throw new Error(`Category ${this.id} is already deleted`);
        }
        this.props.deletedAt = new Date();
        this.props.isActive = false;
        this.props.updatedAt = new Date();
    }
}
