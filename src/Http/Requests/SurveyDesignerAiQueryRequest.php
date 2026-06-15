<?php

namespace AsimNet\Schemava\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class SurveyDesignerAiQueryRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'text' => ['nullable', 'string'],
            'messageHistory' => ['required', 'array', 'min:1', 'max:50'],
            'messageHistory.*.role' => ['required', 'string', 'in:user,assistant,system'],
            'messageHistory.*.content' => ['required', 'string', 'max:120000'],
        ];
    }
}
