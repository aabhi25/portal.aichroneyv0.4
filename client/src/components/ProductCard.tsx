import { ShoppingBag } from "lucide-react";

interface Product {
  id: string;
  name: string;
  description: string;
  price: string | null;
  imageUrl: string | null;
}

interface ProductCardProps {
  products: Product[];
  currencySymbol?: string;
}

export function ProductCard({ products, currencySymbol = "$" }: ProductCardProps) {
  return (
    <div className="space-y-3 not-prose">
      <div className="grid grid-cols-1 gap-3">
        {products.map((product) => (
          <div
            key={product.id}
            className="group relative bg-gradient-to-br from-purple-50/50 via-white to-blue-50/50 dark:from-purple-950/20 dark:via-gray-900 dark:to-blue-950/20 rounded-xl border border-purple-100 dark:border-purple-900/30 overflow-hidden hover:shadow-md transition-all duration-200"
          >
            <div className="flex gap-4 p-4">
              {/* Product Image */}
              {product.imageUrl ? (
                <div className="flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                  <img
                    src={product.imageUrl}
                    alt={product.name}
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : (
                <div className="flex-shrink-0 w-20 h-20 rounded-lg bg-gradient-to-br from-purple-100 to-blue-100 dark:from-purple-900/30 dark:to-blue-900/30 border border-purple-200 dark:border-purple-800 flex items-center justify-center">
                  <ShoppingBag className="w-8 h-8 text-purple-500" />
                </div>
              )}

              {/* Product Info */}
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-1 line-clamp-1">
                  {product.name}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2 line-clamp-2">
                  {product.description}
                </p>
                <div className="flex items-center gap-2">
                  {product.price ? (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-gradient-to-r from-purple-600 to-blue-600 text-white text-sm font-semibold">
                      {currencySymbol}{product.price}
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-sm">
                      Price available upon inquiry
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Gradient Border Effect on Hover */}
            <div className="absolute inset-0 border border-transparent group-hover:border-purple-200 dark:group-hover:border-purple-800/50 rounded-xl pointer-events-none transition-colors duration-200" />
          </div>
        ))}
      </div>
    </div>
  );
}
